"""Score a candidate program. Higher is better; 1.0 is perfect."""

from pathlib import Path
import runpy
import sys


def evaluate(program_path: str) -> dict[str, float]:
    try:
        program = runpy.run_path(str(program_path))
        number = program["choose_number"]()
        if type(number) is not int or not 0 <= number <= 100:
            return {"combined_score": 0.0}
        return {"combined_score": 1.0 / (1.0 + abs(42 - number))}
    except Exception:
        # Invalid candidates are expected during evolution.
        return {"combined_score": 0.0}


if __name__ == "__main__":
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).with_name("initial_program.py")
    print(evaluate(str(path)))
