# Attrition model card

## Intended use

This model evaluates historical records from `data/attrition.csv` and supports a qualified human review of aggregate patterns and synthetic demonstration profiles. It must not automate hiring, termination, promotion, compensation, performance, or other employment decisions.

## Data

- 1,470 historical rows; 237 are labelled `Attrition=Yes`.
- Ten inputs: eight numeric and two categorical fields.
- `Age` and `MaritalStatus` are excluded from training.
- The file has no stable employee identity, manager, job title, location, dates, survey history, project assignment, or intervention outcome.

An unrelated pretrained attrition model is not used. A downloadable model trained on another employer would have different feature definitions, population, base rate, and calibration, so its probabilities would not be valid for this dataset.

## Candidate selection

Version 2.0.0 compares a regularized logistic baseline with a compact gradient-boosted tree pipeline on the same five stratified out-of-fold splits. The challenger is selected only when ROC-AUC improves by at least 0.01, average precision does not decline, and Brier error is no more than 0.002 worse.

| Candidate | ROC-AUC | Average precision | Brier score | Precision | Recall | F1 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Regularized logistic baseline | 0.710 | 0.352 | 0.1232 | 0.306 | 0.540 | 0.391 |
| Compact gradient boosting | 0.727 | 0.364 | 0.1216 | 0.370 | 0.527 | 0.435 |

The compact gradient-boosted model passes the selection gate and is refit on the full dataset. The review threshold is 0.20, selected from out-of-fold probabilities to maximize F1 for a review queue. A customer must recalibrate that threshold to its own population, review capacity, and harm constraints.

## Validation

- Five-fold out-of-fold ROC-AUC: 0.727 (95% stratified bootstrap interval 0.693–0.763).
- Average precision: 0.364 (95% interval 0.316–0.424).
- Brier score: 0.1216 (95% interval 0.1170–0.1263).
- Ten repeated five-fold checks: mean ROC-AUC 0.720 with standard deviation 0.045.
- Expected calibration error: 0.022 across ten equal-frequency bins.
- Feature importance uses held-out permutation importance with average precision, not in-sample tree importance.

## Scenario explanations

The scenario lab constrains numeric inputs to the ranges observed during training. Each local sensitivity replaces one field with the training reference profile, holds the other nine fields fixed, and reports the resulting probability-point change. This is a model-behavior explanation, not a causal reason for attrition.

## Operational controls

- Keep historical benchmark scores separate from imported operational employees.
- Suppress small aggregate cohorts.
- Version the model, metrics, threshold policy, and assessment timestamp.
- Monitor discrimination, calibration, drift, missingness, intervention reach, and review capacity on the employer's governed data.
- Require current records and confidential human evidence before choosing an intervention.
- Never treat retention after an intervention as proof that the intervention caused the outcome.
