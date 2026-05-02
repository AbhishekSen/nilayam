import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import os

st.set_page_config(page_title="Undervalued Project Detector", layout="wide")
st.title("Undervalued Project Detector")
st.caption("Projects priced below their micromarket average, weighted by quality signals")

# --- Load & prepare data ---
csv_path = os.path.join(os.path.dirname(__file__), "..", "output.csv")
df = pd.read_csv(csv_path)

df["price_per_sqft"] = df["minPrice"] / df["minSaleableArea"]
df["discount_pct"] = (
    (df["micromarketPriceAverage"] - df["price_per_sqft"])
    / df["micromarketPriceAverage"] * 100
).round(2)

# Numeric grade: A=5, B=4, C=3, D=2, G=1
grade_score_map = {"A": 5, "B": 4, "C": 3, "D": 2, "G": 1}
df["grade_score"] = df["developerGrade"].map(grade_score_map).fillna(1)

# Possession urgency: sooner = more relevant for buyers (within 2 years = high)
df["possessionDate"] = pd.to_datetime(df["possessionDate"], errors="coerce", utc=True)
today = pd.Timestamp.now(tz="UTC")
df["months_to_possession"] = (
    (df["possessionDate"] - today).dt.days / 30
).clip(lower=0)

# Composite opportunity score (only for projects below market)
# Weights: 40% discount, 35% propscore, 25% developer grade
def min_max(series):
    rng = series.max() - series.min()
    return (series - series.min()) / rng if rng > 0 else series * 0

df["norm_discount"] = min_max(df["discount_pct"].clip(lower=0))
df["norm_propscore"] = min_max(df["propscore"])
df["norm_grade"] = min_max(df["grade_score"])

df["opportunity_score"] = (
    0.40 * df["norm_discount"] +
    0.35 * df["norm_propscore"] +
    0.25 * df["norm_grade"]
).round(3)

GRADE_ORDER = ["A", "B", "C", "D", "G"]
GRADE_COLORS = {"A": "#2ecc71", "B": "#3498db", "C": "#f39c12", "D": "#e74c3c", "G": "#9b59b6"}

# --- Sidebar controls ---
st.sidebar.header("Filters")

min_discount = st.sidebar.slider(
    "Minimum discount vs market (%)", min_value=0, max_value=40, value=5, step=1
)
min_propscore = st.sidebar.slider(
    "Minimum PropScore", min_value=1.0, max_value=5.0, value=2.5, step=0.1
)

grades = [g for g in GRADE_ORDER if g in df["developerGrade"].unique()]
selected_grades = st.sidebar.multiselect("Developer Grade", grades, default=grades)

statuses = sorted(df["projectStatus"].dropna().unique())
selected_status = st.sidebar.multiselect("Project Status", statuses, default=["available"])

micromarkets = sorted(df["micromarket"].dropna().unique())
selected_micromarkets = st.sidebar.multiselect("Micromarket", micromarkets, default=micromarkets)

st.sidebar.divider()
st.sidebar.subheader("Score weights")
w_discount = st.sidebar.slider("Discount weight", 0.0, 1.0, 0.40, 0.05)
w_propscore = st.sidebar.slider("PropScore weight", 0.0, 1.0, 0.35, 0.05)
w_grade = st.sidebar.slider("Developer grade weight", 0.0, 1.0, 0.25, 0.05)

# Recompute score with custom weights (normalize to sum=1)
total_w = w_discount + w_propscore + w_grade
if total_w > 0:
    df["opportunity_score"] = (
        (w_discount / total_w) * df["norm_discount"] +
        (w_propscore / total_w) * df["norm_propscore"] +
        (w_grade / total_w) * df["norm_grade"]
    ).round(3)

# --- Filter ---
mask = (
    (df["discount_pct"] >= min_discount) &
    (df["propscore"] >= min_propscore) &
    (df["developerGrade"].isin(selected_grades)) &
    (df["projectStatus"].isin(selected_status)) &
    (df["micromarket"].isin(selected_micromarkets))
)
fdf = df[mask].sort_values("opportunity_score", ascending=False).copy()

if fdf.empty:
    st.warning("No projects match the current filters. Try lowering the discount or PropScore threshold.")
    st.stop()

# --- KPI row ---
c1, c2, c3, c4, c5 = st.columns(5)
c1.metric("Candidates", len(fdf))
c2.metric("Avg discount vs market", f"{fdf['discount_pct'].mean():.1f}%")
c3.metric("Max discount", f"{fdf['discount_pct'].max():.1f}%")
c4.metric("Avg PropScore", f"{fdf['propscore'].mean():.2f}")
c5.metric("Grade A/B projects", int((fdf["developerGrade"].isin(["A", "B"])).sum()))

st.divider()

# --- Main scatter: discount% vs propscore ---
col_chart, col_info = st.columns([2, 1])

with col_chart:
    fig = px.scatter(
        fdf,
        x="discount_pct",
        y="propscore",
        color="developerGrade",
        color_discrete_map=GRADE_COLORS,
        category_orders={"developerGrade": GRADE_ORDER},
        size="opportunity_score",
        size_max=28,
        hover_name="name",
        hover_data={
            "developerName": True,
            "micromarket": True,
            "price_per_sqft": ":.0f",
            "micromarketPriceAverage": ":.0f",
            "discount_pct": ":.1f",
            "opportunity_score": ":.3f",
            "projectStatus": True,
        },
        labels={
            "discount_pct": "Discount vs Micromarket Avg (%)",
            "propscore": "PropScore",
            "developerGrade": "Developer Grade",
            "opportunity_score": "Opportunity Score",
        },
        title="Discount vs PropScore — bubble size = opportunity score",
    )
    # Threshold lines
    fig.add_vline(x=min_discount, line_dash="dot", line_color="gray",
                  annotation_text=f"Min discount ({min_discount}%)", annotation_position="top right")
    fig.add_hline(y=min_propscore, line_dash="dot", line_color="gray",
                  annotation_text=f"Min PropScore ({min_propscore})", annotation_position="bottom right")

    fig.update_layout(
        height=480,
        plot_bgcolor="white",
        paper_bgcolor="white",
        xaxis=dict(ticksuffix="%"),
    )
    fig.update_xaxes(showgrid=True, gridcolor="#f0f0f0")
    fig.update_yaxes(showgrid=True, gridcolor="#f0f0f0")
    st.plotly_chart(fig, width="stretch")
    st.caption("Top-right quadrant = high quality + deeply discounted. Best candidates live there.")

with col_info:
    st.subheader("How scoring works")
    st.markdown("""
**Opportunity Score** is a weighted composite of three normalized signals:

| Signal | Default weight |
|---|---|
| Discount vs market | 40% |
| PropScore | 35% |
| Developer Grade | 25% |

Developer grade is mapped A→5 … G→1.

All three are min-max normalized before weighting so they're on the same scale.

Adjust weights in the sidebar to prioritize what matters most to you.
""")

st.divider()

# --- Ranked table ---
st.subheader("Ranked candidates")

display_cols = {
    "name": "Project",
    "developerName": "Developer",
    "developerGrade": "Grade",
    "micromarket": "Micromarket",
    "price_per_sqft": "Price/sqft (₹)",
    "micromarketPriceAverage": "Market Avg (₹)",
    "discount_pct": "Discount (%)",
    "propscore": "PropScore",
    "opportunity_score": "Opp. Score",
    "projectStatus": "Status",
    "possessionDate": "Possession",
}

table = fdf[list(display_cols.keys())].copy()
table = table.rename(columns=display_cols)
table["Price/sqft (₹)"] = table["Price/sqft (₹)"].map("₹{:,.0f}".format)
table["Market Avg (₹)"] = table["Market Avg (₹)"].map("₹{:,.0f}".format)
table["Discount (%)"] = table["Discount (%)"].map("{:+.1f}%".format)
table["Possession"] = pd.to_datetime(table["Possession"], errors="coerce", utc=True).dt.strftime("%b %Y")

st.dataframe(table.reset_index(drop=True), width="stretch")

# --- Micromarket breakdown ---
st.divider()
st.subheader("Opportunity by micromarket")

mm = (
    fdf.groupby("micromarket")
    .agg(
        candidates=("id", "count"),
        avg_discount=("discount_pct", "mean"),
        avg_propscore=("propscore", "mean"),
        avg_opp_score=("opportunity_score", "mean"),
    )
    .sort_values("avg_opp_score", ascending=False)
    .reset_index()
)
mm["avg_discount"] = mm["avg_discount"].map("{:.1f}%".format)
mm["avg_propscore"] = mm["avg_propscore"].map("{:.2f}".format)
mm["avg_opp_score"] = mm["avg_opp_score"].map("{:.3f}".format)
mm.columns = ["Micromarket", "Candidates", "Avg Discount", "Avg PropScore", "Avg Opp. Score"]

st.dataframe(mm, width="stretch")
