# Attrition model card

## Purpose

This model scores historical records from the uploaded `Attrition Data.csv` and powers the attrition-risk workflows in LaidbackHR.AI. It is not suitable as the sole basis for hiring, firing, promotion, compensation, or other employment decisions.

## Data

- 1,470 historical rows
- 237 records labelled `Attrition=Yes`
- 13 source columns
- No names, employee IDs, job titles, managers, locations, dates, leave records, training records, promotion records, or hiring events

## Model

A regularised logistic-regression pipeline with median imputation, standardisation for numeric columns, and one-hot encoding for categorical columns.

`Age` and `MaritalStatus` are intentionally excluded from training to reduce fairness and discrimination risk. They remain available only for descriptive inspection of the source file.

## Evaluation

Metrics in `model/model_metadata.json` are generated using five-fold stratified out-of-fold predictions. The review threshold is selected to maximise the out-of-fold F1 score. The model is then refit on the full dataset for deployment.

The small, historical dataset and limited feature set constrain model quality. Validate with current, consented, governed data before any production use.
