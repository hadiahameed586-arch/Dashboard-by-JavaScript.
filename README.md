# ECG and HRV Analysis Dashboard

A self-contained browser dashboard for basic ECG waveform inspection and HRV analysis.

## Open it

Open [index.html](C:\Users\hp\Desktop\ai open ended lab 1\index.html) in a browser.

## Features

- Upload ECG data from `.csv` or `.txt`
- Accepts either `amplitude` rows or `time,amplitude` rows
- Generate a synthetic demo rhythm for exploration
- Detect R-peaks and compute RR intervals
- Show time-domain, frequency-domain, and nonlinear HRV metrics
- Render ECG, RR tachogram, Poincare plot, and PSD charts with no external JS dependencies

## Notes

- If your file contains only amplitude values, set the sampling rate before analysis.
- This project is educational and not a clinical diagnostic tool.
