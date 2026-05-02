import streamlit as st
import pandas as pd
import os

st.set_page_config(page_title="Propsoch Analytics", layout="wide")


@st.cache_data
def load_data():
    csv_path = os.path.join(os.path.dirname(__file__), "..", "output.csv")
    df = pd.read_csv(csv_path)
    df["price_per_sqft"] = df["minPrice"] / df["minSaleableArea"]
    return df


st.sidebar.title("Propsoch Analytics")

pg = st.navigation([
    st.Page("pages/1_Price_vs_Market.py", title="Price vs Market"),
    st.Page("pages/2_Undervalued.py", title="Undervalued"),
    st.Page("pages/3_Amenity_Premium.py", title="Amenity Premium"),
])
pg.run()
