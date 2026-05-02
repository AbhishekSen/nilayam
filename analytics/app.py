import streamlit as st
import pandas as pd
import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

st.set_page_config(page_title="Propsoch Analytics", layout="wide")


@st.cache_data
def load_data():
    client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_ANON_KEY"])
    response = client.table("projects_blr").select("*").execute()
    if not response.data:
        st.error("No data in Supabase table `projects_blr`. Run `uv run main.py` to populate it.")
        st.stop()
    df = pd.DataFrame(response.data)
    df["price_per_sqft"] = df["minPrice"] / df["minSaleableArea"]
    return df


st.sidebar.title("Propsoch Analytics")

pg = st.navigation([
    st.Page("pages/1_Price_vs_Market.py", title="Price vs Market"),
    st.Page("pages/2_Undervalued.py", title="Undervalued"),
    st.Page("pages/3_Amenity_Premium.py", title="Amenity Premium"),
])
pg.run()
