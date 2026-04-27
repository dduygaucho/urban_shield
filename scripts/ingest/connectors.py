"""RSS and Reddit connectors for incident ingestion."""
from __future__ import annotations

import email.utils
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import Iterable

import httpx

from .extract import RawSourceItem, clean_text

REDDIT_SEARCH = "https://www.reddit.com/search.json"


def parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    value = value.strip()
    if not value:
        return None
    try:
        parsed = email.utils.parsedate_to_datetime(value)
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        pass
    try:
        raw = value.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(raw)
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _child_text(el: ET.Element, names: Iterable[str]) -> str:
    for name in names:
        child = el.find(name)
        if child is not None and child.text:
            return child.text.strip()
    return ""


def fetch_rss_items(client: httpx.Client, feeds: list[str], limit_per_feed: int = 20) -> list[RawSourceItem]:
    items: list[RawSourceItem] = []
    for feed_url in feeds:
        if not feed_url:
            continue
        resp = client.get(feed_url, timeout=20.0)
        resp.raise_for_status()
        root = ET.fromstring(resp.text)
        source_name = _child_text(root.find("channel") or root, ["title"]) or feed_url
        rss_items = root.findall("./channel/item")
        if not rss_items:
            rss_items = root.findall("{http://www.w3.org/2005/Atom}entry")
        for node in rss_items[:limit_per_feed]:
            title = _child_text(node, ["title", "{http://www.w3.org/2005/Atom}title"])
            summary = _child_text(
                node,
                [
                    "description",
                    "summary",
                    "{http://www.w3.org/2005/Atom}summary",
                    "{http://www.w3.org/2005/Atom}content",
                ],
            )
            link = _child_text(node, ["link", "guid", "{http://www.w3.org/2005/Atom}id"])
            atom_link = node.find("{http://www.w3.org/2005/Atom}link")
            if atom_link is not None:
                link = atom_link.attrib.get("href") or link
            published = _child_text(node, ["pubDate", "published", "updated", "{http://www.w3.org/2005/Atom}updated"])
            items.append(
                RawSourceItem(
                    source_category="news",
                    source_name=clean_text(source_name)[:64] or "rss",
                    title=title,
                    text=summary,
                    url=link,
                    published_at=parse_datetime(published),
                )
            )
    return items


def fetch_reddit_items(client: httpx.Client, queries: list[str], limit_per_query: int = 25) -> list[RawSourceItem]:
    items: list[RawSourceItem] = []
    seen: set[str] = set()
    for query in queries:
        if not query:
            continue
        resp = client.get(
            REDDIT_SEARCH,
            params={"q": query, "sort": "new", "limit": limit_per_query, "restrict_sr": "false"},
            timeout=30.0,
        )
        resp.raise_for_status()
        children = resp.json().get("data", {}).get("children", [])
        for child in children:
            if child.get("kind") != "t3":
                continue
            data = child.get("data", {})
            permalink = data.get("permalink") or ""
            url = f"https://www.reddit.com{permalink}" if permalink.startswith("/") else permalink
            key = data.get("id") or url
            if key in seen:
                continue
            seen.add(key)
            created_utc = data.get("created_utc")
            published = (
                datetime.fromtimestamp(float(created_utc), tz=timezone.utc)
                if created_utc is not None
                else None
            )
            items.append(
                RawSourceItem(
                    source_category="social",
                    source_name=f"reddit:{query}"[:64],
                    title=data.get("title") or "",
                    text=data.get("selftext") or "",
                    url=url,
                    published_at=published,
                )
            )
    return items

