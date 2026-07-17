"""rf-ews command line interface.

  generate   Create synthetic train/test SigMF scenes with ground-truth labels
  train      Train the track classifier from a labeled recording
  detect     Run detection on a recording → alerts.jsonl (+ summary, library, snapshots)
  evaluate   Score alerts against ground-truth labels (Pd / FAR / F1 / latency)
  dashboard  Serve the alerts dashboard on localhost
"""

import argparse
import json
import os
import sys


def cmd_generate(args):
    from .synth import generate_scene
    os.makedirs(args.out, exist_ok=True)
    for split, seed in (('train', args.seed), ('test', args.seed + 1000)):
        meta, labels = generate_scene(
            os.path.join(args.out, split), fs=args.fs, duration=args.duration,
            seed=seed, n_uas=args.n_uas, n_clutter=args.n_clutter
        )
        print(f'✔ {split}: {meta} + {labels}')


def cmd_train(args):
    from .pipeline import collect_tracks
    from .classifier import TrackClassifier, auto_label_tracks
    inputs = args.input.split(',')
    label_files = args.labels.split(',')
    if len(inputs) != len(label_files):
        sys.exit('--input and --labels must have the same number of entries')
    keep = []
    dropped = 0
    for inp, lab in zip(inputs, label_files):
        print(f'▶ collecting tracks from {inp}…')
        tracks_feats = collect_tracks(inp, thresh_db=args.cfar_db)
        truth = json.load(open(lab))['events']
        labels = auto_label_tracks(tracks_feats, truth)
        keep += [(tf, l) for tf, l in zip(tracks_feats, labels) if l is not None]
        dropped += sum(1 for l in labels if l is None)
    # Prefix augmentation: alerts fire on *young* tracks, so also train on
    # truncated views (first 0.75 s / 1.5 s of bursts) of every labeled track.
    from types import SimpleNamespace
    from .features import extract as feat_extract
    X, y = [], []
    for (track, feats), l in keep:
        X.append(feats)
        y.append(l)
        for horizon in (0.6, 1.2, 2.4):
            pre = [b for b in track.bursts if b['t0'] <= track.onset + horizon]
            if 1 <= len(pre) < len(track.bursts):
                shim = SimpleNamespace(bursts=pre, onset=track.onset,
                                       last_t=max(b['t1'] for b in pre))
                X.append(feat_extract(shim))
                y.append(l)
    print(f'  {len(keep)} labeled tracks → {len(X)} training rows with prefixes · '
          f'{sum(y)} uas / {len(y) - sum(y)} clutter ({dropped} ambiguous dropped)')
    clf = TrackClassifier(t_uas=args.threshold, t_non=args.t_non)
    report = clf.train(X, y)
    clf.save(args.model)
    print(f'✔ model → {args.model}')
    print('  ' + json.dumps(report))


def cmd_detect(args):
    from .pipeline import run_detection
    run_detection(
        args.input, args.model, args.out, report_path=args.report,
        library_path=args.library, snapshots_dir=args.snapshots,
        threshold=args.threshold, thresh_db=args.cfar_db
    )


def cmd_evaluate(args):
    from .evaluate import evaluate
    from .sigmf_io import SigMFReader
    center = 0.0
    if args.input:
        center = SigMFReader(args.input).center_freq
    result = evaluate(args.alerts, args.labels, center_freq=center)
    print(json.dumps(result, indent=2))
    reqs = result['requirements']
    ok = all(v for v in reqs.values())
    print('\n' + ('✅ ALL REQUIREMENTS MET' if ok else '❌ requirements failing: '
          + ', '.join(k for k, v in reqs.items() if not v)))
    if args.out:
        with open(args.out, 'w') as f:
            json.dump(result, f, indent=2)


def cmd_dashboard(args):
    import http.server
    import functools
    root = os.path.abspath(args.dir)
    html_src = os.path.join(os.path.dirname(__file__), 'dashboard.html')
    with open(html_src) as f:
        html = f.read()
    with open(os.path.join(root, 'index.html'), 'w') as f:
        f.write(html)
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=root)
    print(f'▶ dashboard on http://localhost:{args.port} (serving {root})')
    http.server.HTTPServer(('127.0.0.1', args.port), handler).serve_forever()


def main():
    p = argparse.ArgumentParser(prog='rf-ews', description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest='cmd', required=True)

    g = sub.add_parser('generate', help='generate synthetic scenes')
    g.add_argument('--out', default='data')
    g.add_argument('--fs', type=float, default=1_000_000)
    g.add_argument('--duration', type=float, default=30.0)
    g.add_argument('--seed', type=int, default=0)
    g.add_argument('--n-uas', type=int, default=6)
    g.add_argument('--n-clutter', type=int, default=10)
    g.set_defaults(fn=cmd_generate)

    t = sub.add_parser('train', help='train classifier')
    t.add_argument('--input', required=True, help='train .sigmf-meta')
    t.add_argument('--labels', required=True)
    t.add_argument('--model', default='model.pkl')
    t.add_argument('--threshold', type=float, default=0.70)
    t.add_argument('--t-non', type=float, default=0.35)
    t.add_argument('--cfar-db', type=float, default=12.0)
    t.set_defaults(fn=cmd_train)

    d = sub.add_parser('detect', help='run detection')
    d.add_argument('--input', required=True, help='.sigmf-meta or spectrogram .npz')
    d.add_argument('--model', default='model.pkl')
    d.add_argument('--out', default='alerts.jsonl')
    d.add_argument('--report', default='summary.json')
    d.add_argument('--library', default='library.json')
    d.add_argument('--snapshots', default='snapshots')
    d.add_argument('--threshold', type=float, default=None,
                   help='override UAS confidence threshold')
    d.add_argument('--cfar-db', type=float, default=12.0)
    d.set_defaults(fn=cmd_detect)

    e = sub.add_parser('evaluate', help='score alerts vs labels')
    e.add_argument('--alerts', required=True)
    e.add_argument('--labels', required=True)
    e.add_argument('--input', help='the .sigmf-meta used (for center freq)', default=None)
    e.add_argument('--out', default=None)
    e.set_defaults(fn=cmd_evaluate)

    s = sub.add_parser('dashboard', help='serve dashboard')
    s.add_argument('--dir', default='.', help='folder containing alerts.jsonl/summary.json')
    s.add_argument('--port', type=int, default=8080)
    s.set_defaults(fn=cmd_dashboard)

    args = p.parse_args()
    args.fn(args)


if __name__ == '__main__':
    main()
