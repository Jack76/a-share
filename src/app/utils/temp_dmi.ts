
// DMI (Directional Movement Index)
// Standard: Period = 14, ADX Period = 6
const calculateDMI = (history: { close: number; high?: number; low?: number }[], period = 14, adxPeriod = 6) => {
    // Need enough data: Period + ADX Period
    if (history.length < period + adxPeriod) return null;

    const highs = history.map(h => h.high || h.close);
    const lows = history.map(h => h.low || h.close);
    const closes = history.map(h => h.close);

    const trs: number[] = [];
    const pdms: number[] = []; // +DM
    const mdms: number[] = []; // -DM

    // 1. Calculate TR, +DM, -DM for each day
    for (let i = 1; i < history.length; i++) {
        const h = highs[i];
        const l = lows[i];
        const prevC = closes[i-1];
        const prevH = highs[i-1];
        const prevL = lows[i-1];

        // TR
        const tr = Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC));
        trs.push(tr);

        // Directional Movement
        const upMove = h - prevH;
        const downMove = prevL - l;

        if (upMove > downMove && upMove > 0) {
            pdms.push(upMove);
            mdms.push(0);
        } else if (downMove > upMove && downMove > 0) {
            pdms.push(0);
            mdms.push(downMove);
        } else {
            pdms.push(0);
            mdms.push(0);
        }
    }

    // 2. Smooth them using Wilder's Smoothing (First value is Sum, subsequent are smoothed)
    // Initial Sum (for the first 'period' days)
    // Note: trs index 0 corresponds to history index 1.
    // We need 'period' data points.
    
    if (trs.length < period) return null;

    let trSmooth = 0;
    let pdmSmooth = 0;
    let mdmSmooth = 0;

    for(let i=0; i<period; i++) {
        trSmooth += trs[i];
        pdmSmooth += pdms[i];
        mdmSmooth += mdms[i];
    }

    const pdis: number[] = [];
    const mdis: number[] = [];
    const dxs: number[] = [];

    const pushMetrics = (tr: number, pdm: number, mdm: number) => {
        const pdi = tr === 0 ? 0 : (pdm / tr) * 100;
        const mdi = tr === 0 ? 0 : (mdm / tr) * 100;
        pdis.push(pdi);
        mdis.push(mdi);
        
        const sum = pdi + mdi;
        const dx = sum === 0 ? 0 : (Math.abs(pdi - mdi) / sum) * 100;
        dxs.push(dx);
    }

    // First calculated point
    pushMetrics(trSmooth, pdmSmooth, mdmSmooth);

    // Subsequent points
    for (let i = period; i < trs.length; i++) {
        const currentTR = trs[i];
        const currentPDM = pdms[i];
        const currentMDM = mdms[i];

        // Wilder's Smoothing: Previous - (Previous/n) + Current
        trSmooth = trSmooth - (trSmooth / period) + currentTR;
        pdmSmooth = pdmSmooth - (pdmSmooth / period) + currentPDM;
        mdmSmooth = mdmSmooth - (mdmSmooth / period) + currentMDM;
        
        pushMetrics(trSmooth, pdmSmooth, mdmSmooth);
    }

    // 3. Calculate ADX (SMA of DX)
    if (dxs.length < adxPeriod) return null;

    // We only need the latest values
    const lastPdi = pdis[pdis.length - 1];
    const lastMdi = mdis[mdis.length - 1];

    // Simple MA for ADX over the last 'adxPeriod' points of DX
    const relevantDXs = dxs.slice(-adxPeriod);
    const adx = relevantDXs.reduce((a,b)=>a+b, 0) / relevantDXs.length;

    return {
        pdi: lastPdi,
        mdi: lastMdi,
        adx: adx
    };
}
