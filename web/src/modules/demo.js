export function createDemoDataset() {
  const nEvents = 50000;
  const previewN = 10000;

  const params = [
    { label: "FSC-A" },
    { label: "SSC-A" },
    { label: "FL1-A" },
    { label: "FL2-A" },
    { label: "FL3-A" },
  ];

  const channels = params.map(() => new Float32Array(previewN));

  // Two clusters with spillover-ish behavior.
  for (let k = 0; k < previewN; k++) {
    const r = Math.random();
    const isA = r < 0.7;

    const fsc = isA ? randn(52000, 7000) : randn(23000, 5000);
    const ssc = isA ? randn(24000, 5000) : randn(41000, 8000);

    const fl1 = isA ? randn(8000, 2000) : randn(16000, 3000);
    const fl2 = isA ? randn(5000, 1500) : randn(9000, 2500);
    const fl3 = isA ? randn(2000, 900) : randn(7000, 2200);

    // Autofluorescence / spillover toy
    channels[0][k] = Math.max(-2000, fsc);
    channels[1][k] = Math.max(-2000, ssc);
    channels[2][k] = Math.max(-2000, fl1 + 0.12 * fl2);
    channels[3][k] = Math.max(-2000, fl2 + 0.08 * fl1 + 0.05 * fl3);
    channels[4][k] = Math.max(-2000, fl3 + 0.04 * fl2);
  }

  return {
    name: "Demo (synthetic)",
    nEvents,
    params,
    preview: {
      n: previewN,
      channels,
    },
  };
}

function randn(mu, sigma) {
  const u1 = Math.max(1e-12, Math.random());
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mu + z * sigma;
}

