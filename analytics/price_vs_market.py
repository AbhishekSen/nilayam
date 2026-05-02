import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import os

st.set_page_config(page_title="Propsoch Price vs Market", layout="wide")
st.title("Price vs Market Dashboard")
st.caption("Price per sqft of each project vs its micromarket average")

# --- Load data ---
csv_path = os.path.join(os.path.dirname(__file__), "..", "output.csv")
df = pd.read_csv(csv_path)

df["price_per_sqft"] = df["minPrice"] / df["minSaleableArea"]
df["vs_market_pct"] = ((df["price_per_sqft"] - df["micromarketPriceAverage"]) / df["micromarketPriceAverage"] * 100).round(1)
df["bubble_size"] = df["popularity"].map({"A": 22, "Z": 10}).fillna(10)

GRADE_ORDER = ["A", "B", "C", "D", "G"]
GRADE_COLORS = {"A": "#2ecc71", "B": "#3498db", "C": "#f39c12", "D": "#e74c3c", "G": "#9b59b6"}

# --- Sidebar filters ---
st.sidebar.header("Filters")

cities = sorted(df["city"].dropna().unique())
selected_cities = st.sidebar.multiselect("City", cities, default=cities)

grades = [g for g in GRADE_ORDER if g in df["developerGrade"].unique()]
selected_grades = st.sidebar.multiselect("Developer Grade", grades, default=grades)

statuses = sorted(df["projectStatus"].dropna().unique())
selected_status = st.sidebar.multiselect("Project Status", statuses, default=statuses)

show_only_underpriced = st.sidebar.checkbox("Show only underpriced (below market avg)")

# --- Filter ---
mask = (
    df["city"].isin(selected_cities) &
    df["developerGrade"].isin(selected_grades) &
    df["projectStatus"].isin(selected_status)
)
if show_only_underpriced:
    mask &= df["vs_market_pct"] < 0

fdf = df[mask].copy()

if fdf.empty:
    st.warning("No projects match the current filters.")
    st.stop()

# --- KPI row ---
col1, col2, col3, col4 = st.columns(4)
col1.metric("Projects", len(fdf))
col2.metric("Avg Price/sqft", f"₹{fdf['price_per_sqft'].mean():,.0f}")
col3.metric("Below market avg", f"{(fdf['vs_market_pct'] < 0).sum()} projects")
col4.metric("Median vs market", f"{fdf['vs_market_pct'].median():+.1f}%")

st.divider()

# --- Scatter plot ---
axis_min = min(fdf["micromarketPriceAverage"].min(), fdf["price_per_sqft"].min()) * 0.9
axis_max = max(fdf["micromarketPriceAverage"].max(), fdf["price_per_sqft"].max()) * 1.05

fig = px.scatter(
    fdf,
    x="micromarketPriceAverage",
    y="price_per_sqft",
    color="developerGrade",
    color_discrete_map=GRADE_COLORS,
    category_orders={"developerGrade": GRADE_ORDER},
    size="bubble_size",
    size_max=22,
    hover_name="name",
    hover_data={
        "developerName": True,
        "micromarket": True,
        "city": True,
        "vs_market_pct": True,
        "projectStatus": True,
        "popularity": True,
        "bubble_size": False,
        "price_per_sqft": ":.0f",
        "micromarketPriceAverage": ":.0f",
    },
    labels={
        "micromarketPriceAverage": "Micromarket Avg Price/sqft (₹)",
        "price_per_sqft": "Project Price/sqft (₹)",
        "developerGrade": "Developer Grade",
        "vs_market_pct": "vs Market (%)",
    },
    title="Project Price/sqft vs Micromarket Average",
)

# Parity line (project price == market price)
fig.add_trace(go.Scatter(
    x=[axis_min, axis_max],
    y=[axis_min, axis_max],
    mode="lines",
    line=dict(color="gray", dash="dash", width=1),
    name="At market price",
    hoverinfo="skip",
))

fig.update_layout(
    xaxis=dict(range=[axis_min, axis_max], tickprefix="₹", tickformat=","),
    yaxis=dict(range=[axis_min, axis_max], tickprefix="₹", tickformat=","),
    legend_title="Developer Grade",
    height=600,
    plot_bgcolor="white",
    paper_bgcolor="white",
)
fig.update_xaxes(showgrid=True, gridcolor="#f0f0f0")
fig.update_yaxes(showgrid=True, gridcolor="#f0f0f0")

st.plotly_chart(fig, width="stretch")
st.caption("Points **below** the dashed line are priced under their micromarket average. Bubble size = popularity (A > Z).")

st.divider()

# --- Outlier tables ---
col_l, col_r = st.columns(2)

TOP_N = 10
cols_display = ["name", "developerName", "developerGrade", "micromarket", "city",
                "price_per_sqft", "micromarketPriceAverage", "vs_market_pct", "projectStatus"]

with col_l:
    st.subheader("Most underpriced vs market")
    under = fdf.nsmallest(TOP_N, "vs_market_pct")[cols_display].copy()
    under["price_per_sqft"] = under["price_per_sqft"].map("₹{:,.0f}".format)
    under["micromarketPriceAverage"] = under["micromarketPriceAverage"].map("₹{:,.0f}".format)
    under["vs_market_pct"] = under["vs_market_pct"].map("{:+.1f}%".format)
    st.dataframe(under.reset_index(drop=True), width="stretch")

with col_r:
    st.subheader("Most overpriced vs market")
    over = fdf.nlargest(TOP_N, "vs_market_pct")[cols_display].copy()
    over["price_per_sqft"] = over["price_per_sqft"].map("₹{:,.0f}".format)
    over["micromarketPriceAverage"] = over["micromarketPriceAverage"].map("₹{:,.0f}".format)
    over["vs_market_pct"] = over["vs_market_pct"].map("{:+.1f}%".format)
    st.dataframe(over.reset_index(drop=True), width="stretch")
