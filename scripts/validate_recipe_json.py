import json
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
RECIPE_JSON = PROJECT_ROOT / "data" / "recipe.json"


def main() -> None:
    with RECIPE_JSON.open("r", encoding="utf-8") as f:
        data = json.load(f)

    recipes = data.get("recipes", [])
    print(len(recipes))


if __name__ == "__main__":
    main()
