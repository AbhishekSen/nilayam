import requests
import pandas as pd
import os
import time
import tempfile
import shutil

# API configuration
base_url = "https://api.propsoch.com/be/v2/api/project/getProjects"
params = {
    "minBudget": 5000000,
    "maxBudget": 10000000,
    "sortType": "popularity",
    "sortOrder": "desc",
    "possession": "any"
}
csv_file = "output.csv"
REQUEST_TIMEOUT = 30
MAX_RETRIES = 3

# Read existing CSV data if it exists
if os.path.exists(csv_file) and os.path.getsize(csv_file) > 0:
    try:
        df_existing = pd.read_csv(csv_file)
        print(f"Loaded {len(df_existing)} existing projects from CSV")
    except Exception as e:
        print(f"Error reading existing CSV: {e}")
        df_existing = None
else:
    df_existing = None
    print("No existing CSV found, will create new file")

# Collect all projects from all pages
all_projects = []
current_page = 1
total_pages = None

print(f"\nFetching projects from API...")

while True:
    params['currentPage'] = current_page
    print(f"Fetching page {current_page}{'/' + str(total_pages) if total_pages else ''}...", end=" ")

    # Retry loop with exponential backoff
    response = None
    for attempt in range(MAX_RETRIES):
        try:
            response = requests.get(base_url, params=params, timeout=REQUEST_TIMEOUT)
            if response.status_code == 200:
                break
            if response.status_code in (429, 500, 502, 503, 504):
                wait = 2 ** attempt
                print(f"\nStatus {response.status_code}, retrying in {wait}s (attempt {attempt + 1}/{MAX_RETRIES})...")
                time.sleep(wait)
                continue
            # Non-retryable error
            print(f"\nNon-retryable error: {response.status_code}")
            break
        except requests.exceptions.RequestException as e:
            if attempt == MAX_RETRIES - 1:
                print(f"\nRequest failed after {MAX_RETRIES} attempts: {e}")
                break
            wait = 2 ** attempt
            print(f"\nRequest error: {e}, retrying in {wait}s...")
            time.sleep(wait)

    if response is None or response.status_code != 200:
        break

    data = response.json()

    # Extract projects and pagination info from the response
    if isinstance(data, dict):
        if 'data' in data and isinstance(data['data'], dict):
            projects = data['data'].get('projects', [])
            total_pages = data['data'].get('totalPages', None)
            total_projects = data['data'].get('totalProjects', None)
        elif 'projects' in data:
            projects = data['projects']
        else:
            print("\nCould not find 'projects' key in response")
            break
    else:
        print("\nUnexpected response format")
        break

    if not projects:
        print("No more projects found")
        break

    all_projects.extend(projects)
    print(f"Got {len(projects)} projects")

    if total_pages and current_page >= total_pages:
        print(f"\nReached last page ({total_pages})")
        break

    current_page += 1
    time.sleep(0.5)

print(f"\nTotal projects fetched from API: {len(all_projects)}")

if not all_projects:
    print("No projects to save")
    exit(0)

# Convert all projects to DataFrame
df_new = pd.json_normalize(all_projects)

# Combine with existing data — new data first so it wins on deduplication
if df_existing is not None and len(df_existing) > 0:
    df_combined = pd.concat([df_new, df_existing], ignore_index=True)
else:
    df_combined = df_new

# Remove duplicates based on 'id' column (keep='first' preserves the new API data)
if 'id' in df_combined.columns:
    original_count = len(df_combined)
    df_combined = df_combined.drop_duplicates(subset=['id'], keep='first')
    duplicates_removed = original_count - len(df_combined)
    print(f"Removed {duplicates_removed} duplicate projects based on 'id'")
else:
    df_combined = df_combined.drop_duplicates(keep='first')
    print("Removed duplicates based on all columns")

# Calculate new unique projects added
if df_existing is not None and len(df_existing) > 0:
    new_rows = len(df_combined) - len(df_existing)
    print(f"Added {new_rows} new unique projects")
else:
    print(f"Created new CSV with {len(df_combined)} projects")

# Atomically write to CSV via a temp file to avoid corruption on interrupt
tmp_path = None
try:
    with tempfile.NamedTemporaryFile('w', delete=False, suffix='.csv', dir='.') as tmp:
        tmp_path = tmp.name
        df_combined.to_csv(tmp_path, index=False)
    shutil.move(tmp_path, csv_file)
except Exception as e:
    if tmp_path and os.path.exists(tmp_path):
        os.unlink(tmp_path)
    raise

print(f"\nData successfully saved to {csv_file}")
print(f"Total unique projects in CSV: {len(df_combined)}")
print(f"Columns: {', '.join(df_combined.columns.tolist())}")
