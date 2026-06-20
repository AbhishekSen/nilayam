import os
from functools import lru_cache

from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))


@lru_cache(maxsize=1)
def get_client() -> Client:
    url = os.environ["SUPABASE_URL"]
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ["SUPABASE_ANON_KEY"]
    return create_client(url, key)


def fetch_projects() -> list[dict]:
    response = get_client().table("projects_blr").select("*").execute()
    return response.data or []
