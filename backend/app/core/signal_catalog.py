"""Hand-authored signal specs, one per catalog group (``algorithm`` slug).

A spec is the single definition of what the Signal Assessor is asked to
score, how the rubric parser interprets the scores, and how stored
evaluations are labelled. Groups without a spec use ``DEFAULT_SIGNAL_SPEC``.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

SignalKind = Literal["score", "boolean"]
SignalRole = Literal["dimension", "modifier"]
SignalAxis = Literal["fidelity", "executable", "fluency"]

DEFAULT_ALGORITHM = "default"


@dataclass(frozen=True)
class SignalDefinition:
    key: str
    label: str
    kind: SignalKind
    role: SignalRole
    weight: float
    guidance: str
    variation_strategy: str
    axis: SignalAxis | None = None


@dataclass(frozen=True)
class SignalSpec:
    algorithm: str
    version: int
    signals: tuple[SignalDefinition, ...]
    structural_elements: tuple[str, ...]

    @property
    def keys(self) -> tuple[str, ...]:
        return tuple(signal.key for signal in self.signals)

    def signal(self, key: str) -> SignalDefinition | None:
        for signal in self.signals:
            if signal.key == key:
                return signal
        return None

    def reference(self) -> dict[str, Any]:
        return {"algorithm": self.algorithm, "version": self.version}


_CORRECTNESS = SignalDefinition(
    key="correctness",
    label="Correctness",
    kind="score",
    role="dimension",
    weight=0.25,
    guidance="Would the answer return the right result for the intended input contract?",
    variation_strategy="change the input shape so a subtly wrong answer path fails",
)
_SYNTAX = SignalDefinition(
    key="syntax",
    label="Syntax and executability",
    kind="boolean",
    role="modifier",
    weight=0.05,
    guidance="Is the answer valid, runnable Python?",
    variation_strategy="keep the logic small so the code must parse cleanly",
    axis="executable",
)
_COMPLETION_TIME = SignalDefinition(
    key="completionTime",
    label="Speed and fluency",
    kind="score",
    role="modifier",
    weight=0.05,
    guidance="Score fluency from elapsedMs; fast, confident recall scores high.",
    variation_strategy="shrink the variation so it can be recalled quickly",
    axis="fluency",
)


def _spec(
    algorithm: str,
    dimensions: tuple[SignalDefinition, ...],
    structural_elements: tuple[str, ...],
    version: int = 1,
) -> SignalSpec:
    return SignalSpec(
        algorithm=algorithm,
        version=version,
        signals=(*dimensions, _CORRECTNESS, _SYNTAX, _COMPLETION_TIME),
        structural_elements=structural_elements,
    )


DEFAULT_SIGNAL_SPEC = _spec(
    DEFAULT_ALGORITHM,
    (
        SignalDefinition(
            key="structure",
            label="Solution structure",
            kind="score",
            role="dimension",
            weight=0.2,
            guidance="Does the answer have the overall shape of the expected solution?",
            variation_strategy="make the reusable algorithm shape unmistakable",
        ),
        SignalDefinition(
            key="completeness",
            label="Completeness",
            kind="score",
            role="dimension",
            weight=0.2,
            guidance="Are all required steps present, including the return path?",
            variation_strategy="require every step from setup through the return path",
        ),
        SignalDefinition(
            key="patternFidelity",
            label="Pattern fidelity",
            kind="score",
            role="dimension",
            weight=0.25,
            guidance="Does the answer use the intended algorithm pattern rather than a workaround?",
            variation_strategy="make the reusable algorithm shape unmistakable",
            axis="fidelity",
        ),
    ),
    ("hasSignature", "hasLoop", "hasGuard"),
)

SLIDING_WINDOW_SIGNAL_SPEC = _spec(
    "sliding-window",
    (
        SignalDefinition(
            key="windowState",
            label="Window state",
            kind="score",
            role="dimension",
            weight=0.15,
            guidance="Are the left boundary, window contents, and best answer initialized?",
            variation_strategy="force the window state variables to be named and initialized",
        ),
        SignalDefinition(
            key="expandStep",
            label="Expand step",
            kind="score",
            role="dimension",
            weight=0.15,
            guidance="Does the right edge advance once per element and add it to the window?",
            variation_strategy="change what the incoming element contributes to the window",
        ),
        SignalDefinition(
            key="windowRepair",
            label="Window repair",
            kind="score",
            role="dimension",
            weight=0.25,
            guidance="While the window is invalid, does it remove the left element and advance left?",
            variation_strategy="change the validity rule so the shrink loop must be rebuilt",
            axis="fidelity",
        ),
        SignalDefinition(
            key="answerUpdate",
            label="Valid-window scoring",
            kind="score",
            role="dimension",
            weight=0.1,
            guidance="Is the best answer updated only from a valid window, and returned?",
            variation_strategy="ask for a different score of the valid window",
        ),
    ),
    ("hasSignature", "hasExpandLoop", "hasShrinkStep", "hasScoreUpdate", "hasGuard"),
)

TWO_POINTERS_SIGNAL_SPEC = _spec(
    "two-pointers",
    (
        SignalDefinition(
            key="pointerSetup",
            label="Pointer setup",
            kind="score",
            role="dimension",
            weight=0.15,
            guidance="Are both pointers initialized at the right ends or offsets?",
            variation_strategy="move the starting positions so setup must be reasoned out",
        ),
        SignalDefinition(
            key="scanLoop",
            label="Pointer scan loop",
            kind="score",
            role="dimension",
            weight=0.15,
            guidance="Does the loop run while the pointers have not crossed?",
            variation_strategy="change the termination condition the loop must respect",
        ),
        SignalDefinition(
            key="comparisonRule",
            label="Comparison rule",
            kind="score",
            role="dimension",
            weight=0.2,
            guidance="Does each iteration compare the pointed values against the goal?",
            variation_strategy="change the target relation being compared",
        ),
        SignalDefinition(
            key="pointerMovement",
            label="Pointer movement",
            kind="score",
            role="dimension",
            weight=0.15,
            guidance="Does exactly the correct pointer move based on the comparison?",
            variation_strategy="flip which side should move for each comparison outcome",
            axis="fidelity",
        ),
    ),
    ("hasSignature", "hasPointerLoop", "hasComparison", "hasPointerMove"),
)

BINARY_SEARCH_SIGNAL_SPEC = _spec(
    "binary-search",
    (
        SignalDefinition(
            key="searchBounds",
            label="Interval setup",
            kind="score",
            role="dimension",
            weight=0.15,
            guidance="Are the low and high bounds initialized to cover the whole search space?",
            variation_strategy="change the search space so the bounds must be re-derived",
        ),
        SignalDefinition(
            key="loopCondition",
            label="Search loop",
            kind="score",
            role="dimension",
            weight=0.15,
            guidance="Does the loop condition match the interval convention (closed vs half-open)?",
            variation_strategy="switch the interval convention",
        ),
        SignalDefinition(
            key="midpoint",
            label="Midpoint step",
            kind="score",
            role="dimension",
            weight=0.1,
            guidance="Is the midpoint computed inside the loop without overflow-style mistakes?",
            variation_strategy="make the midpoint choice matter for termination",
        ),
        SignalDefinition(
            key="boundUpdate",
            label="Bound update",
            kind="score",
            role="dimension",
            weight=0.25,
            guidance="Does the comparison discard the correct half and always shrink the interval?",
            variation_strategy="change the predicate so the discarded half flips",
            axis="fidelity",
        ),
    ),
    ("hasSignature", "hasSearchLoop", "hasMidpoint", "hasBoundUpdate"),
)

DYNAMIC_PROGRAMMING_SIGNAL_SPEC = _spec(
    "dynamic-programming",
    (
        SignalDefinition(
            key="stateDefinition",
            label="State definition",
            kind="score",
            role="dimension",
            weight=0.15,
            guidance="Is there a table or memo whose entries have a clear subproblem meaning?",
            variation_strategy="change what each state entry must represent",
        ),
        SignalDefinition(
            key="baseCase",
            label="Base case",
            kind="score",
            role="dimension",
            weight=0.15,
            guidance="Are the base cases set before any transition reads them?",
            variation_strategy="change the smallest subproblem so base cases must be re-derived",
        ),
        SignalDefinition(
            key="fillOrder",
            label="Fill order",
            kind="score",
            role="dimension",
            weight=0.1,
            guidance="Are states computed in an order where dependencies are already solved?",
            variation_strategy="change the dependency direction of the recurrence",
        ),
        SignalDefinition(
            key="transition",
            label="Transition update",
            kind="score",
            role="dimension",
            weight=0.25,
            guidance="Does each state combine earlier states with the correct recurrence?",
            variation_strategy="change the recurrence while keeping the state shape",
            axis="fidelity",
        ),
    ),
    ("hasSignature", "hasStateTable", "hasBaseCase", "hasTransition"),
)

SIGNAL_SPECS: dict[str, SignalSpec] = {
    spec.algorithm: spec
    for spec in (
        SLIDING_WINDOW_SIGNAL_SPEC,
        TWO_POINTERS_SIGNAL_SPEC,
        BINARY_SEARCH_SIGNAL_SPEC,
        DYNAMIC_PROGRAMMING_SIGNAL_SPEC,
    )
}


def get_signal_spec(algorithm_slug: str | None) -> SignalSpec:
    return SIGNAL_SPECS.get(str(algorithm_slug or ""), DEFAULT_SIGNAL_SPEC)


def spec_to_json(spec: SignalSpec) -> dict[str, Any]:
    return {
        "algorithm": spec.algorithm,
        "version": spec.version,
        "signals": [
            {
                "key": signal.key,
                "label": signal.label,
                "kind": signal.kind,
                "role": signal.role,
                "weight": signal.weight,
                "guidance": signal.guidance,
                "variationStrategy": signal.variation_strategy,
                "axis": signal.axis,
            }
            for signal in spec.signals
        ],
        "structuralElements": list(spec.structural_elements),
    }


def spec_from_json(raw: Any) -> SignalSpec | None:
    if not isinstance(raw, dict) or not isinstance(raw.get("signals"), list) or not raw["signals"]:
        return None
    try:
        signals = tuple(
            SignalDefinition(
                key=str(item["key"]),
                label=str(item["label"]),
                kind=item["kind"],
                role=item["role"],
                weight=float(item["weight"]),
                guidance=str(item.get("guidance", "")),
                variation_strategy=str(item.get("variationStrategy", "")),
                axis=item.get("axis"),
            )
            for item in raw["signals"]
        )
        return SignalSpec(
            algorithm=str(raw["algorithm"]),
            version=int(raw["version"]),
            signals=signals,
            structural_elements=tuple(str(item) for item in raw.get("structuralElements", [])),
        )
    except (KeyError, TypeError, ValueError):
        return None
