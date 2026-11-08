"""Shared contracts: the data shapes modules agree on instead of depending on each other.

This is the lowest layer. It may import only the standard library and pydantic, so
evaluators, persistence, read models and core engines can all depend on it without
depending on one another.
"""
