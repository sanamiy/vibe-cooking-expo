import json
import os
import re
import time
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse

import requests

BASE_URL = "https://park.ajinomoto.co.jp"
SEARCH_URL = "https://park.ajinomoto.co.jp/recipe/search/?search_word="
TARGET_COUNT = 50
REQUEST_TIMEOUT = 30
SLEEP_SECONDS = 0.3

PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_JSON = PROJECT_ROOT / "data" / "recipe.json"
IMAGE_DIR = PROJECT_ROOT / "data" / "recipe-img"

CARD_LINK_PATTERN = re.compile(r"/recipe/card/\d+/?")
SEARCH_OR_TAG_LINK_PATTERN = re.compile(
    r'href=["\'](/recipe/search/\?[^"\']*|/tag/\d+/?)["\']', re.IGNORECASE
)
GENERIC_RECIPE_LINK_PATTERN = re.compile(
    r'href=["\'](/recipe/(?:search/\?[^"\']*|corner/[^"\']*|card/\d+/?))?["\']',
    re.IGNORECASE,
)
LD_JSON_PATTERN = re.compile(
    r"<script[^>]*type=[\"']application/ld\+json[\"'][^>]*>(.*?)</script>",
    re.IGNORECASE | re.DOTALL,
)


def _extract_servings(recipe_yield: Any) -> tuple[int | None, str | None]:
    if recipe_yield is None:
        return None, None

    if isinstance(recipe_yield, list):
        for item in recipe_yield:
            servings, label = _extract_servings(item)
            if servings is not None:
                return servings, label
        return None, None

    raw_text = str(recipe_yield).strip()
    if not raw_text:
        return None, None

    normalized = raw_text.replace("（", "(").replace("）", ")")
    match = re.search(r"(\d+)", normalized)
    if not match:
        return None, None

    servings = int(match.group(1))
    return servings, f"{servings}人前"


def _get(session: requests.Session, url: str) -> str:
    try:
        response = session.get(url, timeout=REQUEST_TIMEOUT)
        response.raise_for_status()
        response.encoding = "utf-8"
        return response.text
    except requests.exceptions.SSLError:
        response = session.get(url, timeout=REQUEST_TIMEOUT, verify=False)
        response.raise_for_status()
        response.encoding = "utf-8"
        return response.text


def _reset_outputs() -> None:
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    for ext in ("*.jpg", "*.jpeg", "*.png", "*.webp"):
        for image_file in IMAGE_DIR.glob(ext):
            image_file.unlink(missing_ok=True)
    OUTPUT_JSON.write_text("", encoding="utf-8")


def _extract_card_links(html: str) -> list[str]:
    links = sorted(set(CARD_LINK_PATTERN.findall(html)))
    return [urljoin(BASE_URL, link) for link in links]


def _extract_discovery_links(html: str) -> list[str]:
    links = {match.group(1) for match in SEARCH_OR_TAG_LINK_PATTERN.finditer(html)}
    links.update(match.group(1) for match in GENERIC_RECIPE_LINK_PATTERN.finditer(html) if match.group(1))
    links = sorted(links)
    return [urljoin(BASE_URL, link) for link in links]


def collect_recipe_urls(session: requests.Session, target_count: int) -> list[str]:
    queue = [SEARCH_URL]
    visited = set()
    recipe_urls: list[str] = []
    recipe_set = set()

    while queue and len(recipe_urls) < target_count:
        current = queue.pop(0)
        if current in visited:
            continue
        visited.add(current)

        try:
            html = _get(session, current)
        except requests.RequestException as error:
            print(f"[WARN] Failed to fetch discovery page: {current} ({error})")
            continue

        for card_url in _extract_card_links(html):
            if card_url not in recipe_set:
                recipe_set.add(card_url)
                recipe_urls.append(card_url)
                if len(recipe_urls) >= target_count:
                    break

        if len(recipe_urls) >= target_count:
            break

        for next_url in _extract_discovery_links(html):
            if next_url not in visited and next_url not in queue:
                queue.append(next_url)

        time.sleep(SLEEP_SECONDS)

    return recipe_urls[:target_count]


def _parse_ld_json_blocks(html: str) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for raw_block in LD_JSON_PATTERN.findall(html):
        raw_block = raw_block.strip()
        if not raw_block:
            continue
        try:
            loaded = json.loads(raw_block)
        except json.JSONDecodeError:
            continue

        if isinstance(loaded, dict):
            if "@graph" in loaded and isinstance(loaded["@graph"], list):
                records.extend(item for item in loaded["@graph"] if isinstance(item, dict))
            else:
                records.append(loaded)
        elif isinstance(loaded, list):
            records.extend(item for item in loaded if isinstance(item, dict))
    return records


def _pick_recipe_schema(records: list[dict[str, Any]]) -> dict[str, Any] | None:
    for rec in records:
        rec_type = rec.get("@type")
        if isinstance(rec_type, str) and rec_type.lower() == "recipe":
            return rec
        if isinstance(rec_type, list) and any(
            isinstance(item, str) and item.lower() == "recipe" for item in rec_type
        ):
            return rec
    return None


def _extract_recipe_id(url: str) -> str:
    match = re.search(r"/recipe/card/(\d+)/?", url)
    return match.group(1) if match else "unknown"


def _normalize_image_url(image_field: Any) -> str | None:
    if isinstance(image_field, str):
        return image_field
    if isinstance(image_field, list) and image_field:
        first = image_field[0]
        if isinstance(first, str):
            return first
        if isinstance(first, dict):
            return first.get("url")
    if isinstance(image_field, dict):
        return image_field.get("url")
    return None


def _download_image_with_name(
    session: requests.Session, image_url: str, filename_stem: str
) -> str | None:
    if not image_url:
        return None
    parsed = urlparse(image_url)
    ext = os.path.splitext(parsed.path)[1].lower()
    if ext not in {".jpg", ".jpeg", ".png", ".webp"}:
        ext = ".jpg"

    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    output_path = IMAGE_DIR / f"{filename_stem}{ext}"

    try:
        response = session.get(image_url, timeout=REQUEST_TIMEOUT)
        response.raise_for_status()
    except requests.exceptions.SSLError:
        response = session.get(image_url, timeout=REQUEST_TIMEOUT, verify=False)
        response.raise_for_status()
    except requests.RequestException as error:
        print(f"[WARN] Image download failed: {image_url} ({error})")
        return None

    output_path.write_bytes(response.content)
    return str(output_path.relative_to(PROJECT_ROOT / "data")).replace("\\", "/")


def scrape_recipe(session: requests.Session, recipe_url: str) -> dict[str, Any] | None:
    try:
        html = _get(session, recipe_url)
    except requests.RequestException as error:
        print(f"[WARN] Failed to fetch recipe page: {recipe_url} ({error})")
        return None

    records = _parse_ld_json_blocks(html)
    recipe_schema = _pick_recipe_schema(records)
    if not recipe_schema:
        print(f"[WARN] Recipe schema not found: {recipe_url}")
        return None

    recipe_id = _extract_recipe_id(recipe_url)
    image_url = _normalize_image_url(recipe_schema.get("image"))

    image_path = None
    if image_url:
        image_path = _download_image_with_name(session, image_url, recipe_id)

    recipe_yield = recipe_schema.get("recipeYield")
    recipe_servings, recipe_servings_label = _extract_servings(recipe_yield)

    instruction_steps = []
    step_matches = re.findall(r'<li class="recipeProcess">(.*?)</li>', html, re.DOTALL)
    original_instructions = recipe_schema.get("recipeInstructions") or []

    if step_matches:
        for i, match in enumerate(step_matches):
            text_match = re.search(r'</h3>\s*<span>(.*?)</span>', match, re.DOTALL)
            text = text_match.group(1).strip() if text_match else ""
            text = re.sub(r'<[^>]+>', '', text)

            img_match = re.search(r'<img[^>]+src="([^"]+)"', match)
            step_image_url = img_match.group(1) if img_match else None

            schema_text = original_instructions[i] if i < len(original_instructions) else text

            instruction_steps.append({
                "text": schema_text,
                "image_url": step_image_url,
                "image_path": None,
            })
    else:
        for inst in original_instructions:
            instruction_steps.append({
                "text": inst,
                "image_url": None,
                "image_path": None,
            })

    for idx, step in enumerate(instruction_steps, start=1):
        if step["image_url"]:
            downloaded = _download_image_with_name(
                session, step["image_url"], f"{recipe_id}_step_{idx:02d}"
            )
            step["image_path"] = downloaded

    return {
        "id": recipe_id,
        "url": recipe_url,
        "name": recipe_schema.get("name"),
        "description": recipe_schema.get("description"),
        "image_url": image_url,
        "image_path": image_path,
        "total_time": recipe_schema.get("totalTime"),
        "recipe_yield": recipe_yield,
        "recipe_servings": recipe_servings,
        "recipe_servings_label": recipe_servings_label,
        "ingredients": recipe_schema.get("recipeIngredient") or [],
        "instructions": original_instructions,
        "instruction_steps": instruction_steps,
    }


def main() -> None:
    _reset_outputs()

    session = requests.Session()
    session.headers.update({"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})

    print("[INFO] Collecting recipe URLs...")
    recipe_urls = collect_recipe_urls(session, TARGET_COUNT)
    print(f"[INFO] Collected {len(recipe_urls)} recipe URLs")

    recipes: list[dict[str, Any]] = []
    for index, recipe_url in enumerate(recipe_urls, start=1):
        print(f"[INFO] Scraping ({index}/{len(recipe_urls)}): {recipe_url}")
        data = scrape_recipe(session, recipe_url)
        if data:
            recipes.append(data)
        time.sleep(SLEEP_SECONDS)

    OUTPUT_JSON.write_text(
        json.dumps(
            {
                "source": SEARCH_URL,
                "requested_count": TARGET_COUNT,
                "downloaded_count": len(recipes),
                "recipes": recipes,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    print(f"[INFO] Saved {len(recipes)} recipes to {OUTPUT_JSON}")
    print(f"[INFO] Images directory: {IMAGE_DIR}")


if __name__ == "__main__":
    main()
