"""Scoring harness: Pd, FAR, UAS-class F1, alert latency vs ground-truth labels."""

import json
import numpy as np


def _overlaps(alert, ev, f_margin_hz=50_000):
    ot = min(alert['t_emitted'], ev['t_end']) - max(alert['t_onset'], ev['t_start'])
    if ot <= 0:
        return False
    a_lo = alert['f_center_hz'] - alert['bandwidth_hz'] / 2
    a_hi = alert['f_center_hz'] + alert['bandwidth_hz'] / 2
    return a_hi >= ev['f_lo'] - f_margin_hz and a_lo <= ev['f_hi'] + f_margin_hz


def evaluate(alerts_path, labels_path, center_freq=0.0):
    alerts = [json.loads(l) for l in open(alerts_path) if l.strip()]
    truth = json.load(open(labels_path))['events']
    # Alerts store absolute freq (center + offset); labels store baseband offsets
    for a in alerts:
        a['f_center_hz'] = a['f_center_hz'] - center_freq

    uas_events = [e for e in truth if e['class'] == 'uas']
    clutter_events = [e for e in truth if e['class'] == 'clutter']
    uas_alerts = [a for a in alerts if a['verdict'] == 'UAS-like']

    # --- Detection: Pd over ground-truth UAS events ---
    detected, latencies = [], []
    for ev in uas_events:
        hits = [a for a in uas_alerts if _overlaps(a, ev)]
        if hits:
            detected.append(ev)
            # Per-event alert latency: time from this event's onset to the
            # first UAS-like alert whose time/freq bounds cover it.
            first = min(hits, key=lambda a: a['t_emitted'])
            latencies.append(max(first['t_emitted'] - ev['t_start'], 0.0))
    pd = len(detected) / len(uas_events) if uas_events else None

    # --- False alarms: UAS-like alerts that match no true UAS event ---
    false_alarms = [a for a in uas_alerts if not any(_overlaps(a, ev) for ev in uas_events)]
    far = len(false_alarms) / len(alerts) if alerts else 0.0

    # --- Per-alert F1 on the UAS class ---
    tp = len(uas_alerts) - len(false_alarms)
    fp = len(false_alarms)
    fn = sum(1 for ev in uas_events
             if not any(_overlaps(a, ev) for a in uas_alerts))
    prec = tp / (tp + fp) if tp + fp else 0.0
    rec = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0.0

    result = {
        'truth_uas_events': len(uas_events),
        'truth_clutter_events': len(clutter_events),
        'alerts_total': len(alerts),
        'uas_like_alerts': len(uas_alerts),
        'Pd': round(pd, 3) if pd is not None else None,
        'FAR': round(far, 3),
        'false_alarms': len(false_alarms),
        'precision_uas': round(prec, 3),
        'recall_uas': round(rec, 3),
        'F1_uas': round(f1, 3),
        'latency_mean_s': round(float(np.mean(latencies)), 3) if latencies else None,
        'latency_max_s': round(float(np.max(latencies)), 3) if latencies else None,
        'requirements': {
            'Pd >= 0.90': bool(pd is not None and pd >= 0.90),
            'FAR <= 0.03': bool(far <= 0.03),
            'F1 >= 0.85': bool(f1 >= 0.85),
            'latency <= 2s': bool(latencies and max(latencies) <= 2.0)
        }
    }
    return result
