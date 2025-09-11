function parseAlgo(logString){
  const lines = logString.split(/\r?\n/);
  const a3Results = []; // AEC/ANS/HOW on/off
  const leakResults = []; // Leak flag 0/1
  let currentTime = null; // e.g. 20:00:10.373
  for (let i=0;i<lines.length;i++){
    const raw = lines[i];
    const line = raw.trim();
    const tsMatch = line.match(/^(\d{2}:\d{2}:\d{2}\.\d{3})\|/);
    if (tsMatch) currentTime = tsMatch[1];
    const timeStr = (currentTime ? currentTime : '').split('.')[0];

    // Parse 3A and leak from Prep[...] line
    if (line.includes('Prep[')){
      // AEC:1|1|1  -> on when first digit is 1
      const aecMatch = line.match(/AEC:(\d)(?:\|\d\|\d)?/i);
      const ansMatch = line.match(/ANS:(\d)/i);
      const howMatch = line.match(/HOW:(\d)/i);
      const agcMatch = line.match(/\bAGC:(-?\d)/i);
      const leakMatch = line.match(/\bleak:(\d)/i);
      if ((aecMatch || ansMatch || howMatch) && timeStr){
        a3Results.push({
          time: timeStr,
          aec: aecMatch ? (parseInt(aecMatch[1]) === 1 ? 1 : 0) : null,
          ans: ansMatch ? (parseInt(ansMatch[1]) === 1 ? 1 : 0) : null,
          how: howMatch ? (parseInt(howMatch[1]) === 1 ? 1 : 0) : null,
          agc: agcMatch ? (parseInt(agcMatch[1]) === 1 ? 1 : 0) : null
        });
      }
      if (leakMatch && timeStr){
        leakResults.push({ time: timeStr, leak: parseInt(leakMatch[1]) });
      }
    }
    // Also capture leak from other lines (e.g., Loopback: ... leak:0)
    if (!line.includes('Prep[')){
      const leakMatch2 = line.match(/\bleak:(\d)/i);
      if (leakMatch2 && timeStr){ leakResults.push({ time: timeStr, leak: parseInt(leakMatch2[1]) }); }
    }
  }
  return { a3Results, leakResults };
}

function drawAlgoChart(data){
  const times = data.a3Results.map(d=>d.time);
  const aec = data.a3Results.map(d=> d.aec != null ? d.aec : null);
  const ans = data.a3Results.map(d=> d.ans != null ? d.ans : null);
  const how = data.a3Results.map(d=> d.how != null ? d.how : null);
  const agc = data.a3Results.map(d=> d.agc != null ? d.agc : null);
  const leakTimes = data.leakResults.map(d=>d.time);
  const leakFlags = data.leakResults.map(d=>d.leak);
  const chartDom = document.getElementById('algo-chart');
  window.algoChart = echarts.init(chartDom);
  const option = {
    title: { text: '算法开关与回声泄漏', left: 'center', textStyle: { fontSize: 18, fontWeight: 'bold', color: '#2c3e50' }, subtext: (times.length + leakTimes.length) + ' 个采样点', subtextStyle: { color: '#7f8c8d' } },
    tooltip: { trigger: 'axis' },
    legend: { data: ['AEC','ANS','HOW','AGC','Leak(0/1)'], bottom: 10 },
    grid: { left: '3%', right: '4%', bottom: '15%', top: '15%', containLabel: true },
    dataZoom: [ { type: 'inside', start: 0, end: 100, throttle: 50 }, { type: 'slider', start: 0, end: 100, bottom: 40, throttle: 50 } ],
    xAxis: { type: 'category', data: times.length ? times : leakTimes, axisLabel: { interval: 'auto', rotate: 30, fontSize: 11 } },
    yAxis: [ { type: 'value', name: '开关/泄漏', min: -0.1, max: 1.1, interval: 1, axisLabel: { formatter: function(v){ return v===1?'开/有':'关/无'; } } } ],
    series: [
      { name: 'AEC', type: 'line', step: 'start', data: aec, symbol: 'circle', symbolSize: 6, lineStyle: { width: 3, color: '#8e44ad' } },
      { name: 'ANS', type: 'line', step: 'start', data: ans, symbol: 'circle', symbolSize: 6, lineStyle: { width: 3, color: '#16a085' } },
      { name: 'HOW', type: 'line', step: 'start', data: how, symbol: 'circle', symbolSize: 6, lineStyle: { width: 3, color: '#2980b9' } },
      { name: 'AGC', type: 'line', step: 'start', data: agc, symbol: 'circle', symbolSize: 6, lineStyle: { width: 3, color: '#2c3e50' } },
      { name: 'Leak(0/1)', type: 'line', step: 'start', data: leakFlags, symbol: 'circle', symbolSize: 6, lineStyle: { width: 3, color: '#e67e22' } }
    ]
  };
  window.algoChart.setOption(option);
}

export function parseAndDrawAlgo(logString){
  const parsed = parseAlgo(logString);
  const box = document.getElementById('algo-chart-box');
  if (parsed.a3Results.length || parsed.leakResults.length){ drawAlgoChart(parsed); box.style.display = 'block'; } else { box.style.display = 'none'; }
  return parsed;
}