Upload these files to the same paths in your GitHub repository:

app.js
portfolio-data.js
gain-loss-history.js
scripts/update_gain_loss_history.py
.github/workflows/update-gain-loss-history.yml

The updated 今日总盈亏 formula is transaction-aware:
ending market value + today sale proceeds - today purchase cost - beginning shares x previous close.

After uploading, manually run Record gain-loss history once from the Actions tab.
