import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from scipy import stats

from app import load_data

st.title("Amenity Premium Analysis")
st.caption("Which amenities actually command a price premium vs. which are just marketing?")

# --- Load & prepare data ---
df = load_data()

AMENITIES = {
    "petPark": "Pet Park",
    "squash": "Squash Court",
    "pharmacy": "Pharmacy",
    "basketball": "Basketball Court",
    "heatedPool": "Heated Pool",
}

# --- Sidebar filters ---
st.sidebar.header("Filters")

micromarkets = sorted(df["micromarket"].dropna().unique())
selected_micromarkets = st.sidebar.multiselect("Micromarket", micromarkets, default=micromarkets)

grades = sorted(df["developerGrade"].dropna().unique())
selected_grades = st.sidebar.multiselect("Developer Grade", grades, default=grades)

statuses = sorted(df["projectStatus"].dropna().unique())
selected_status = st.sidebar.multiselect("Project Status", statuses, default=["available"])

significance_level = st.sidebar.slider("Significance level (α)", 0.01, 0.20, 0.05, 0.01)

mask = (
    df["micromarket"].isin(selected_micromarkets)
    & df["developerGrade"].isin(selected_grades)
    & df["projectStatus"].isin(selected_status)
)
fdf = df[mask].copy()

if len(fdf) < 5:
    st.warning("Too few projects match the current filters. Broaden your selection.")
    st.stop()

# --- Compute premium stats per amenity ---
results = []
for col, label in AMENITIES.items():
    with_amenity = fdf.loc[fdf[col] == 1, "price_per_sqft"].dropna()
    without_amenity = fdf.loc[fdf[col] == 0, "price_per_sqft"].dropna()

    if len(with_amenity) < 2 or len(without_amenity) < 2:
        continue

    mean_with = with_amenity.mean()
    mean_without = without_amenity.mean()
    premium_pct = ((mean_with - mean_without) / mean_without) * 100
    t_stat, p_value = stats.ttest_ind(with_amenity, without_amenity, equal_var=False)

    results.append({
        "amenity": label,
        "col": col,
        "n_with": len(with_amenity),
        "n_without": len(without_amenity),
        "mean_with": mean_with,
        "mean_without": mean_without,
        "premium_pct": premium_pct,
        "t_stat": t_stat,
        "p_value": p_value,
        "significant": p_value < significance_level,
    })

if not results:
    st.warning("Not enough data to analyze amenity premiums with current filters.")
    st.stop()

res_df = pd.DataFrame(results).sort_values("premium_pct", ascending=False)

# --- KPI row ---
sig_count = res_df["significant"].sum()
top = res_df.iloc[0]
c1, c2, c3, c4 = st.columns(4)
c1.metric("Projects analyzed", len(fdf))
c2.metric("Amenities tested", len(res_df))
c3.metric("Statistically significant", int(sig_count))
c4.metric("Highest premium", f"{top['amenity']}: {top['premium_pct']:+.1f}%")

st.divider()

# --- Premium bar chart ---
col_bar, col_box = st.columns(2)

with col_bar:
    st.subheader("Price premium by amenity")
    bar_df = res_df.copy()
    bar_df["color"] = bar_df["significant"].map({True: "Significant", False: "Not significant"})
    fig_bar = px.bar(
        bar_df,
        x="amenity",
        y="premium_pct",
        color="color",
        color_discrete_map={"Significant": "#2ecc71", "Not significant": "#bdc3c7"},
        text=bar_df["premium_pct"].map(lambda v: f"{v:+.1f}%"),
        labels={"premium_pct": "Price Premium (%)", "amenity": "Amenity", "color": ""},
    )
    fig_bar.update_layout(
        height=420,
        plot_bgcolor="white",
        paper_bgcolor="white",
        yaxis=dict(ticksuffix="%", zeroline=True, zerolinecolor="black", zerolinewidth=1),
        showlegend=True,
    )
    fig_bar.update_traces(textposition="outside")
    fig_bar.update_xaxes(showgrid=False)
    fig_bar.update_yaxes(showgrid=True, gridcolor="#f0f0f0")
    st.plotly_chart(fig_bar, use_container_width=True)
    st.caption(f"Green = statistically significant at α={significance_level}. "
               "Premium = % difference in avg ₹/sqft between projects with vs. without the amenity.")

# --- Box plots ---
with col_box:
    st.subheader("Price distribution: with vs. without")
    box_rows = []
    for _, row in res_df.iterrows():
        col_name = row["col"]
        for val, group_label in [(1, f"With {row['amenity']}"), (0, f"Without {row['amenity']}")]:
            subset = fdf.loc[fdf[col_name] == val, ["price_per_sqft"]].copy()
            subset["group"] = group_label
            subset["amenity"] = row["amenity"]
            box_rows.append(subset)

    box_df = pd.concat(box_rows, ignore_index=True)
    fig_box = px.box(
        box_df,
        x="amenity",
        y="price_per_sqft",
        color="group",
        labels={"price_per_sqft": "Price per sqft (₹)", "amenity": "Amenity", "group": ""},
    )
    fig_box.update_layout(
        height=420,
        plot_bgcolor="white",
        paper_bgcolor="white",
        boxmode="group",
    )
    fig_box.update_xaxes(showgrid=False)
    fig_box.update_yaxes(showgrid=True, gridcolor="#f0f0f0")
    st.plotly_chart(fig_box, use_container_width=True)
    st.caption("Box plots show median, quartiles, and outliers for each group.")

st.divider()

# --- Detailed stats table ---
st.subheader("Statistical summary")
table = res_df[[
    "amenity", "n_with", "n_without", "mean_with", "mean_without",
    "premium_pct", "t_stat", "p_value", "significant",
]].copy()
table.columns = [
    "Amenity", "N (with)", "N (without)", "Avg ₹/sqft (with)", "Avg ₹/sqft (without)",
    "Premium (%)", "t-statistic", "p-value", "Significant",
]
table["Avg ₹/sqft (with)"] = table["Avg ₹/sqft (with)"].map("₹{:,.0f}".format)
table["Avg ₹/sqft (without)"] = table["Avg ₹/sqft (without)"].map("₹{:,.0f}".format)
table["Premium (%)"] = table["Premium (%)"].map("{:+.1f}%".format)
table["t-statistic"] = table["t-statistic"].map("{:.2f}".format)
table["p-value"] = table["p-value"].map("{:.4f}".format)
table["Significant"] = table["Significant"].map({True: "Yes", False: "No"})

st.dataframe(table.reset_index(drop=True), use_container_width=True)

st.divider()

# --- Micromarket interaction: does the premium hold across locations? ---
st.subheader("Amenity premium by micromarket")
st.caption("Does the premium hold across locations, or is it driven by a few expensive micromarkets?")

selected_amenity = st.selectbox(
    "Select amenity",
    options=[r["col"] for r in results],
    format_func=lambda c: AMENITIES[c],
)

mm_rows = []
for mm in fdf["micromarket"].dropna().unique():
    mm_data = fdf[fdf["micromarket"] == mm]
    with_a = mm_data.loc[mm_data[selected_amenity] == 1, "price_per_sqft"].dropna()
    without_a = mm_data.loc[mm_data[selected_amenity] == 0, "price_per_sqft"].dropna()
    if len(with_a) >= 1 and len(without_a) >= 1:
        premium = ((with_a.mean() - without_a.mean()) / without_a.mean()) * 100
        mm_rows.append({
            "micromarket": mm,
            "n_with": len(with_a),
            "n_without": len(without_a),
            "avg_with": with_a.mean(),
            "avg_without": without_a.mean(),
            "premium_pct": premium,
        })

if mm_rows:
    mm_df = pd.DataFrame(mm_rows).sort_values("premium_pct", ascending=False)
    fig_mm = px.bar(
        mm_df,
        x="micromarket",
        y="premium_pct",
        color="premium_pct",
        color_continuous_scale=["#e74c3c", "#f0f0f0", "#2ecc71"],
        color_continuous_midpoint=0,
        text=mm_df["premium_pct"].map(lambda v: f"{v:+.1f}%"),
        hover_data={"n_with": True, "n_without": True, "avg_with": ":.0f", "avg_without": ":.0f"},
        labels={"premium_pct": "Premium (%)", "micromarket": "Micromarket"},
        title=f"{AMENITIES[selected_amenity]} premium by micromarket",
    )
    fig_mm.update_layout(
        height=400,
        plot_bgcolor="white",
        paper_bgcolor="white",
        yaxis=dict(ticksuffix="%", zeroline=True, zerolinecolor="black", zerolinewidth=1),
        coloraxis_showscale=False,
    )
    fig_mm.update_traces(textposition="outside")
    fig_mm.update_xaxes(showgrid=False, tickangle=-45)
    fig_mm.update_yaxes(showgrid=True, gridcolor="#f0f0f0")
    st.plotly_chart(fig_mm, use_container_width=True)
    st.caption("Micromarkets with only 1-2 projects per group should be interpreted cautiously.")
else:
    st.info("Not enough micromarket-level data for this amenity.")

st.divider()

# --- Methodology ---
st.subheader("Methodology")
st.markdown(f"""
**Metric:** `minPrice / minSaleableArea` (₹ per sqft)

**Test:** Welch's t-test (unequal variance) comparing projects *with* vs *without* each amenity.

**Significance level:** α = {significance_level}

**Caveat:** Correlation ≠ causation. Premium amenities tend to appear in premium projects.
The micromarket breakdown above helps disentangle location effects from true amenity premiums.
Projects with multiple premium amenities may inflate individual amenity estimates.
""")
