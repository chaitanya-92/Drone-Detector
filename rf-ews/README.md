# RF-EWS — Anti-UAS RF Early Warning (Track 3)

Passive RF early-warning prototype: detects UAS-related RF emissions (control/telemetry/video links) in SigMF IQ recordings or spectrogram bundles, classifies them **UAS-like / Non-UAS / Unknown** with a confidence score, raises JSON alerts within the ≤2 s latency budget, and enrolls signatures for re-occurrence matching. Defensive monitoring only — no countermeasures. Fully offline, laptop-CPU only.

## Measured results (synthetic evaluation scenes, unseen seeds)

| Metric | Requirement | Scene A | Scene B |
|---|---|---|---|
| Pd (UAS events) | ≥ 0.90 | **1.00** | **1.00** |
| FAR | ≤ 3% | **0.9%** | **2.2%** |
| F1 (UAS class) | ≥ 0.85 | **0.99** | **0.98** |
| Max alert latency | ≤ 2 s | **0.91 s** | **1.85 s** |
| Throughput | realtime bonus | ~7× realtime | ~7× realtime |

## Quick start (no data needed)

```bash
pip install -r requirements.txt

# 1. Generate synthetic training + evaluation scenes (SigMF + ground truth)
python -m rf_ews.cli generate --out data --duration 30 --seed 0

# 2. Train the classifier (multiple scenes recommended, comma-separated)
python -m rf_ews.cli train --input data/train.sigmf-meta --labels data/train_labels.json \
    --model model.pkl

# 3. Detect → alerts.jsonl + summary.json + signature library + evidence snapshots
python -m rf_ews.cli detect --input data/test.sigmf-meta --model model.pkl \
    --out alerts.jsonl --report summary.json --library library.json --snapshots snapshots \
    --threshold 0.70

# 4. Score against ground truth (Pd / FAR / F1 / latency)
python -m rf_ews.cli evaluate --alerts alerts.jsonl --labels data/test_labels.json \
    --input data/test.sigmf-meta

# 5. Review alerts in the dashboard (timeline + evidence snapshots + threshold slider)
python -m rf_ews.cli dashboard --dir . --port 8080
```

For best accuracy train on several scenes: `--input a.sigmf-meta,b.sigmf-meta --labels a_labels.json,b_labels.json`.

## Docker (fixed command format)

```bash
docker build -t rf-ews .
docker run -v $(pwd)/data:/data rf-ews detect \
  --input /data/capture.sigmf-meta --model /data/model.pkl \
  --out /data/alerts.jsonl --report /data/summary.json --threshold 0.70
```

## Inputs

- **SigMF IQ**: `.sigmf-meta` + `.sigmf-data` (cf32_le). Sample rate/center frequency read from metadata.
- **Spectrogram bundle**: `.npz` with `S_db` [freq×time], `freqs_hz`, `times_s`.

## How it works

```
IQ ─► 0.5 s chunks ─► STFT ─► adaptive noise floor ─► CFAR burst detection
   ─► burst tracker (continuity + strict hopper rules) ─► per-track features
   ─► gradient-boosted classifier (prefix-trained for early evidence)
   ─► ternary verdict + confidence ─► JSONL alerts + signature library
```

Key design decisions:

- **Recall-first detection, precision from classification.** The CFAR stage is permissive; the classifier and track association burn down false alarms.
- **Strict track association.** Continuity requires frequency overlap *and* similar bandwidth; the hopper rule only chains fast-arriving, ms-scale, same-shape packets. This keeps concurrent emitters from merging.
- **Prefix-trained classifier.** Training includes truncated views of every track (first 0.6/1.2/2.4 s) so young tracks classify correctly — that's what makes the ≤2 s alert latency achievable.
- **Streaming semantics.** The file is processed as if it arrived live; alert latency is measured against the stream clock, not file position.
- **Chunk-cadence artifact feature.** Weak continuous tones re-detected once per chunk mimic slow beacons; a burst-phase-alignment feature lets the classifier reject them.
- **Live verdict upgrades.** Non-UAS/Unknown tracks are re-examined every chunk as evidence accrues; UAS-like tracks re-announce when they grow or get fed after a lull (covers late-joining emitters within the latency budget).

## Alert format (JSONL)

```json
{"alert_id":"a-000012","verdict":"UAS-like","confidence":0.97,
 "t_onset":14.23,"t_emitted":14.99,"latency_s":0.77,
 "f_center_hz":2440312500.0,"bandwidth_hz":27500.0,"n_bursts":4,
 "features":{"hop_rate":...},"track_id":"trk-0082",
 "signature":{"id":"sig-003","similarity":0.95,"new_signature":false},
 "evidence":"snapshots/a-000012.png"}
```

`summary.json` adds run-level stats: verdict counts, latency mean/p95, realtime factor, thresholds.

## Threshold tuning

`--threshold` sets the UAS confidence cut (default 0.70, calibrated for FAR ≈ 1–2% at Pd 1.0 on synthetic data). Raise it to trade Pd for FAR; the `evaluate` command reports the resulting operating point, and the dashboard has a live threshold slider.

## Layout

```
rf_ews/
  synth.py       synthetic scene generator (FHSS/video/beacon + WiFi/BLE/CW/impulse clutter)
  sigmf_io.py    SigMF + spectrogram-bundle readers (no external deps)
  dsp.py         STFT front end, adaptive noise floor, CFAR burst extraction
  tracker.py     burst→emitter track association
  features.py    per-track discriminative features
  classifier.py  gradient-boosted classifier + auto-labeling from ground truth
  library.py     signature library (cosine matching, re-occurrence counts)
  pipeline.py    streaming detect pipeline + alert engine
  evaluate.py    Pd / FAR / F1 / latency scoring harness
  cli.py         generate | train | detect | evaluate | dashboard
  dashboard.html terminal-style alert review UI
```

## Honest limitations

Trained on synthetic data only so far — swap in real captures (DroneRF etc.) via the same train command once available. Two same-protocol emitters transmitting simultaneously in overlapping spectrum may merge into one track (alert coverage still works via refresh alerts, but they're reported as one emitter). The `latency_s` field in an alert is track-level; per-event latency is what `evaluate` measures.
