function parseTimeHelpers(){
  function parseTimeStr(timeStr){
    const today = new Date();
    const [h, m, s_ms] = timeStr.split(':');
    const [s, ms] = s_ms.split('.');
    return new Date(today.getFullYear(), today.getMonth(), today.getDate(), parseInt(h), parseInt(m), parseInt(s), parseInt(ms));
  }
  function formatTime(dateObj){
    const hh = String(dateObj.getHours()).padStart(2,'0');
    const mm = String(dateObj.getMinutes()).padStart(2,'0');
    const ss = String(dateObj.getSeconds()).padStart(2,'0');
    return `${hh}:${mm}:${ss}`;
  }
  return { parseTimeStr, formatTime };
}

function parseDevice(logString){
  const lines = logString.split(/\r?\n/);
  const micResults = [];
  const muteResults = [];
  const meterResults = [];
  const deviceNameResults = [];
  const volumeResults = [];
  const deviceTypeResults = [];
  const sessionCountResults = [];
  const deltaResults = []; // 新增，用于delta数据

  const slmddResults = []; // 新增：存储slmdd检测样本, 格式 {time, count}

  const { parseTimeStr, formatTime } = parseTimeHelpers();
  function normalize(n){ return Math.round(n / 32768 * 100); }
  let currentTimeWithMs = null;

  for (let i=0;i<lines.length;i++){
    const raw = lines[i];
    const line = raw.trim();

    const timePrefixMatch = line.match(/^(\d{2}:\d{2}:\d{2}\.\d{3})\|[IEW]\|/);
    let fullTimePrefix = null; if (timePrefixMatch) fullTimePrefix = timePrefixMatch[1];
    if (fullTimePrefix) currentTimeWithMs = fullTimePrefix;

    // 新增：提取 slmdd detected <数字> times，必须跟数字才有效
    const slmddMatch = line.match(/slmdd detected (\d+) times/);
    if (slmddMatch && currentTimeWithMs){
      slmddResults.push({
        time: currentTimeWithMs,
        count: parseInt(slmddMatch[1], 10)
      });
    }

    if (line.includes('preprocess:')){
      const match = line.match(/preprocess:([0-9]{1,5}),([0-9]{1,5}),([0-9]{1,5}),([0-9]{1,5}),([0-9]{1,5})/);
      if (match && fullTimePrefix){
        const nums = match.slice(1,6).map(n=>parseInt(n));
        const baseDate = parseTimeStr(fullTimePrefix); baseDate.setSeconds(baseDate.getSeconds()-8);
        const times = []; for (let t=0;t<5;t++){ const dt = new Date(baseDate.getTime()+t*2000); times.push(formatTime(dt)); }
        const normNums = nums.map(normalize);
        for (let idx=0; idx<5; idx++){
          meterResults.push({ time: times[idx], preprocess: normNums[idx], indevmeter: null, outdevmeter: null });
        }
      }
    }

    if (line.includes('indevmeter:')){
      const match = line.match(/indevmeter:([0-9]{1,5}),([0-9]{1,5}),([0-9]{1,5}),([0-9]{1,5}),([0-9]{1,5})/);
      if (match && fullTimePrefix){
        const nums = match.slice(1,6).map(n=>parseInt(n));
        const baseDate = parseTimeStr(fullTimePrefix); baseDate.setSeconds(baseDate.getSeconds()-8);
        const times = []; for (let t=0;t<5;t++){ const dt = new Date(baseDate.getTime()+t*2000); times.push(formatTime(dt)); }
        const normNums = nums.map(normalize);
        times.forEach((time, idx)=>{
          const obj = meterResults.find(v=>v.time===time);
          if (obj) obj.indevmeter = normNums[idx]; else meterResults.push({ time, preprocess: null, indevmeter: normNums[idx], outdevmeter: null });
        });
      }
    }

    if (line.includes('outdevmeter:')){
      const match = line.match(/outdevmeter:([0-9]{1,5}),([0-9]{1,5}),([0-9]{1,5}),([0-9]{1,5}),([0-9]{1,5})/);
      if (match && fullTimePrefix){
        const nums = match.slice(1,6).map(n=>parseInt(n));
        const baseDate = parseTimeStr(fullTimePrefix); baseDate.setSeconds(baseDate.getSeconds()-8);
        const times = []; for (let t=0;t<5;t++){ const dt = new Date(baseDate.getTime()+t*2000); times.push(formatTime(dt)); }
        const normNums = nums.map(normalize);
        times.forEach((time, idx)=>{
          const obj = meterResults.find(v=>v.time===time);
          if (obj) obj.outdevmeter = normNums[idx]; else meterResults.push({ time, preprocess: null, indevmeter: null, outdevmeter: normNums[idx] });
        });
      }
    }

    const timeStr = line.slice(0,12).split('.')[0];
    const curTime = (currentTimeWithMs ? currentTimeWithMs : '').split('.')[0] || timeStr;

    if (line.startsWith('ENC-audio-out: state:')){
      const stateMatch = line.match(/state:(\w+),/);
      if (stateMatch && curTime){ micResults.push({ time: curTime, state: stateMatch[1] }); }
    }

    // 扬声器静音（从 PLAY 行解析 mute:0/1）
    if (line.startsWith('PLAY:')){
      const muteMatch = raw.match(/\bmute:\s*([01])/i);
      if (muteMatch && curTime){
        const mute = parseInt(muteMatch[1], 10); // 1=静音, 0=未静音
        muteResults.push({ time: curTime, mute });
      }
    }

    // 设备名（CAP/PLAY 行）
    if (line.startsWith('CAP:') || line.startsWith('PLAY:')){
      const inNameMatch  = raw.match(/inDev:[\s\S]*?name:([\s\S]*?)(?=\s+(?:Energy:|delta:|BVC:|mute:|vol\(|api:|$))/i);
      const outNameMatch = raw.match(/outDev:[\s\S]*?name:([\s\S]*?)(?=\s+(?:Energy:|delta:|BVC:|mute:|vol\(|api:|$))/i);
      const inName  = inNameMatch  ? inNameMatch[1].trim()  : null;
      const outName = outNameMatch ? outNameMatch[1].trim() : null;
      if ((inName || outName) && curTime){
        deviceNameResults.push({ time: curTime, inDevName: inName, outDevName: outName });
      }
    }

    // 设备类型（inDev:/outDev: 后到第一个逗号为止）
    if (line.startsWith('CAP:') || line.startsWith('PLAY:')){
      const inTypeMatch  = raw.match(/inDev:([^,]+)/i);
      const outTypeMatch = raw.match(/outDev:([^,]+)/i);
      const inDevType  = inTypeMatch  ? inTypeMatch[1].trim()  : null;
      const outDevType = outTypeMatch ? outTypeMatch[1].trim() : null;
      if ((inDevType || outDevType) && curTime){
        deviceTypeResults.push({ time: curTime, inDevType, outDevType });
      }
    }

    // 系统音量（CAP 行 sys-vol:(cap,boost,play)）
    if (line.startsWith('CAP:')){
      const volMatch = raw.match(/sys-vol:\(\s*(\d+)\s*,\s*([-\d]+)\s*,\s*(\d+)\s*\)/i);
      if (volMatch && curTime){
        const capVol = parseInt(volMatch[1], 10);
        const playVol = parseInt(volMatch[3], 10);
        volumeResults.push({ time: curTime, capVol, playVol });
      }
    }

    // Session counts: recording/playback
    if (/WebRtcAudioManager/i.test(line)){
      const recMatch = raw.match(/session\s+listen\s+recording\s+count\s+(\d+)/i);
      const playMatch = raw.match(/session\s+listen\s+playback\s+count\s+(\d+)/i);
      if ((recMatch || playMatch) && curTime){
        let obj = sessionCountResults.find(v=>v.time===curTime);
        if (!obj){
          obj = { time: curTime, recordingCount: null, playbackCount: null };
          sessionCountResults.push(obj);
        }
        if (recMatch) obj.recordingCount = parseInt(recMatch[1], 10);
        if (playMatch) obj.playbackCount = parseInt(playMatch[1], 10);
      }
    }

    // 新增：提取 CAP 行 delta:xxxms
    if (line.startsWith('CAP:')){
      const capDeltaMatch = raw.match(/delta:(\d+)ms/);
      if (capDeltaMatch && currentTimeWithMs){
        const deltaCap = parseInt(capDeltaMatch[1], 10);
        let obj = deltaResults.find(v => v.time === currentTimeWithMs);
        if (!obj) {
          obj = { time: currentTimeWithMs, deltaCap: null, deltaPlay: null };
          deltaResults.push(obj);
        }
        obj.deltaCap = deltaCap;
      }
    }
    // 新增：提取 PLAY 行 delta:xxxms
    if (line.startsWith('PLAY:')){
      const playDeltaMatch = raw.match(/delta:(\d+)ms/);
      if (playDeltaMatch && currentTimeWithMs){
        const deltaPlay = parseInt(playDeltaMatch[1], 10);
        let obj = deltaResults.find(v => v.time === currentTimeWithMs);
        if (!obj) {
          obj = { time: currentTimeWithMs, deltaCap: null, deltaPlay: null };
          deltaResults.push(obj);
        }
        obj.deltaPlay = deltaPlay;
      }
    }
  }

  return { micResults, muteResults, meterResults, deviceNameResults, volumeResults, deviceTypeResults, sessionCountResults, deltaResults, slmddResults };
}



function drawMicChart(micData, muteData){
  const timeSet = new Set([
    ...micData.map(d=>d.time),
    ...muteData.map(d=>d.time),
  ]);
  const times = Array.from(timeSet).sort();

  const micSeries = times.map(t=>{
    const d = micData.find(x=>x.time===t);
    return d ? (d.state === 'runing' ? 1 : 0) : null;
  });
  const muteSeries = times.map(t=>{
    const m = muteData.find(x=>x.time===t);
    return m != null ? m.mute : null; // 1=静音, 0=未静音
  });

  const chartDom = document.getElementById('mic-chart');
  window.micChart = echarts.init(chartDom);
  const option = {
    title: {
      text: '麦克风状态与扬声器静音',
      left: 'center',
      textStyle: { fontSize: 18, fontWeight: 'bold', color: '#2c3e50' },
      subtext: `${micData.length} 状态点 | ${muteData.length} 静音点`,
      subtextStyle: { color: '#7f8c8d' }
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255,255,255,0.95)',
      borderColor: '#ddd',
      borderWidth: 1,
      textStyle: { color: '#333' },
      formatter: function(params){
        const time = params[0]?.axisValue || '';
        let r = `<div style="font-weight:bold; margin-bottom:6px;">${time}</div>`;
        params.forEach(p=>{
          if (p.seriesName === '麦克风状态'){
            const txt = p.value === 1 ? '运行中' : p.value === 0 ? '空闲' : '无';
            r += `<div>${p.marker} ${p.seriesName}: <span style="font-weight:bold">${txt}</span></div>`;
          } else if (p.seriesName === '扬声器静音'){
            const txt = p.value === 1 ? '静音' : p.value === 0 ? '未静音' : '无';
            r += `<div>${p.marker} ${p.seriesName}: <span style="font-weight:bold">${txt}</span></div>`;
          }
        });
        return r;
      }
    },
    legend: { data: ['麦克风状态','扬声器静音'], bottom: 10 },
    grid: { left: '3%', right: '4%', bottom: '15%', top: '15%', containLabel: true },
    toolbox: { feature: { saveAsImage: { title: '保存为图片', pixelRatio: 2 }, dataZoom: { title: { zoom: '区域缩放', back: '缩放还原' } } } },
    dataZoom: [
      { type: 'inside', start: 0, end: 100, throttle: 50 },
      { type: 'slider', start: 0, end: 100, bottom: 40, throttle: 50 }
    ],
    xAxis: {
      type: 'category',
      data: times,
      axisLabel: { interval: 'auto', rotate: 30, fontSize: 11 },
      name: '时间',
      nameLocation: 'middle',
      nameGap: 30,
      axisLine: { lineStyle: { color: '#ccc' } }
    },
    yAxis: {
      type: 'value',
      name: '状态',
      min: -0.1,
      max: 1.1,
      interval: 1,
      axisLabel: {
        formatter: function(value){
          return value === 1 ? '1' : value === 0 ? '0' : '';
        }
      },
      axisLine: { lineStyle: { color: '#ccc' } },
      splitLine: { show: false }
    },
    series: [
      {
        name: '麦克风状态',
        type: 'line',
        data: micSeries,
        step: 'start',
        symbol: 'circle',
        symbolSize: 8,
        lineStyle: { width: 3, color: '#3498db' },
        itemStyle: {
          color: function(p){ return p.value === 1 ? '#2ecc71' : '#95a5a6'; }
        },
        markPoint: { data: [ { type: 'max', name: '最大值' }, { type: 'min', name: '最小值' } ] }
      },
      {
        name: '扬声器静音',
        type: 'line',
        data: muteSeries,
        step: 'start',
        symbol: 'diamond',
        symbolSize: 8,
        lineStyle: { width: 3, color: '#e67e22' },
        itemStyle: {
          color: function(p){ return p.value === 1 ? '#e67e22' : '#f1c40f'; }
        }
      }
    ]
  };
  window.micChart.setOption(option);
}

function drawMeterChart(data){
  const timeSet = new Set(data.map(d=>d.time));
  const times = Array.from(timeSet).sort();
  const preprocessData = []; const indevmeterData = []; const outdevmeterData = [];
  times.forEach(t=>{
    const entry = data.find(d=>d.time===t) || {};
    preprocessData.push(entry.preprocess != null ? entry.preprocess : null);
    indevmeterData.push(entry.indevmeter != null ? entry.indevmeter : null);
    outdevmeterData.push(entry.outdevmeter != null ? entry.outdevmeter : null);
  });
  const chartDom = document.getElementById('meter-chart');
  window.meterChart = echarts.init(chartDom);
  const option = {
    title: { text: '音频Meter采集值（归一化0-100）', left: 'center', textStyle: { fontSize: 18, fontWeight: 'bold', color: '#2c3e50' }, subtext: data.length + ' 个采样点', subtextStyle: { color: '#7f8c8d' } },
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(255,255,255,0.95)', borderColor: '#ddd', borderWidth: 1, textStyle: { color: '#333' }, formatter: function(params){ let r = `<div style="font-weight:bold; margin-bottom:8px;">时间: ${params[0].axisValue}</div>`; params.forEach(p=>{ const val = p.value != null ? p.value : '无数据'; r += `<div>${p.marker} ${p.seriesName}: <span style="font-weight:bold">${val}</span></div>`; }); return r; } },
    legend: { data: ['Preprocess','InDevMeter','OutDevMeter'], bottom: 10 },
    grid: { left: '3%', right: '4%', bottom: '15%', top: '15%', containLabel: true },
    toolbox: { feature: { saveAsImage: { title: '保存为图片', pixelRatio: 2 }, dataZoom: { title: { zoom: '区域缩放', back: '缩放还原' } } } },
    dataZoom: [ { type: 'inside', start: 0, end: 100, throttle: 50 }, { type: 'slider', start: 0, end: 100, bottom: 40, throttle: 50 } ],
    xAxis: { type: 'category', data: times, axisLabel: { interval: 'auto', rotate: 30, fontSize: 11 }, name: '时间', nameLocation: 'middle', nameGap: 30, axisLine: { lineStyle: { color: '#ccc' } } },
    yAxis: { type: 'value', name: '归一化值 (0-100)', min: 0, max: 100, axisLine: { lineStyle: { color: '#ccc' } }, splitLine: { lineStyle: { type: 'dashed', color: '#eee' } } },
    series: [
      { name: 'Preprocess', type: 'line', data: preprocessData, smooth: true, symbol: 'circle', symbolSize: 6, lineStyle: { width: 3, color: '#5470c6' }, itemStyle: { color: '#5470c6' } },
      { name: 'InDevMeter', type: 'line', data: indevmeterData, smooth: true, symbol: 'circle', symbolSize: 6, lineStyle: { width: 3, color: '#91cc75' }, itemStyle: { color: '#91cc75' } },
      { name: 'OutDevMeter', type: 'line', data: outdevmeterData, smooth: true, symbol: 'circle', symbolSize: 6, lineStyle: { width: 3, color: '#ff6b6b' }, itemStyle: { color: '#ff6b6b' } }
    ]
  };
  window.meterChart.setOption(option);
}


function drawDeviceVolumeChart(data){
  const times = data.map(d=>d.time);
  const capVols = data.map(d=>d.capVol);
  const playVols = data.map(d=>d.playVol);
  const chartDom = document.getElementById('device-volume-chart') || document.getElementById('device-chart');
  if (!chartDom) return;
  window.deviceVolumeChart = echarts.init(chartDom);
  const option = {
    title: { text: '系统音量（采集/播放）', left: 'center', textStyle: { fontSize: 18, fontWeight: 'bold', color: '#2c3e50' }, subtext: data.length + ' 条记录', subtextStyle: { color: '#7f8c8d' } },
    tooltip: {
      trigger: 'axis',
      formatter: function(params){
        const time = params[0] ? params[0].axisValue : '';
        let r = `<div style="font-weight:bold; margin-bottom:6px;">${time}</div>`;
        params.forEach(p=>{ r += `<div>${p.marker} ${p.seriesName}: <span style="font-weight:bold">${p.value}</span></div>`; });
        return r;
      }
    },
    legend: { data: ['采集音量(capVol)','播放音量(playVol)'], bottom: 10 },
    grid: { left: '3%', right: '4%', bottom: '15%', top: '15%', containLabel: true },
    dataZoom: [ { type: 'inside', start: 0, end: 100, throttle: 50 }, { type: 'slider', start: 0, end: 100, bottom: 40, throttle: 50 } ],
    xAxis: { type: 'category', data: times, axisLabel: { interval: 'auto', rotate: 30, fontSize: 11 }, name: '时间', nameLocation: 'middle', nameGap: 30 },
    yAxis: { type: 'value', name: '音量(0-100)', min: 0, max: 100, axisLine: { lineStyle: { color: '#ccc' } }, splitLine: { lineStyle: { type: 'dashed', color: '#eee' } } },
    series: [
      { name: '采集音量(capVol)', type: 'line', data: capVols, smooth: true, symbol: 'circle', symbolSize: 7, lineStyle: { width: 3, color: '#1abc9c' } },
      { name: '播放音量(playVol)', type: 'line', data: playVols, smooth: true, symbol: 'circle', symbolSize: 7, lineStyle: { width: 3, color: '#e67e22' } }
    ]
  };
  window.deviceVolumeChart.setOption(option);
}


function drawDeviceNamesChart(data){
  const timeSet = new Set(data.map(d=>d.time));
  const times = Array.from(timeSet);
  const nameSet = new Set();
  data.forEach(d=>{ if (d.inDevName) nameSet.add(d.inDevName); if (d.outDevName) nameSet.add(d.outDevName); });
  const names = Array.from(nameSet);
  const nameToIndex = Object.fromEntries(names.map((n,idx)=>[n, idx]));
  const inSeries = times.map(t=>{ const d = data.find(x=>x.time===t && x.inDevName); return d ? nameToIndex[d.inDevName] : null; });
  const outSeries = times.map(t=>{ const d = data.find(x=>x.time===t && x.outDevName); return d ? nameToIndex[d.outDevName] : null; });

  const chartDom = document.getElementById('device-chart');
  if (!chartDom) return;
  window.deviceChart = echarts.init(chartDom);
  const option = {
    title: { text: '采集/播放设备名称', left: 'center', textStyle: { fontSize: 18, fontWeight: 'bold', color: '#2c3e50' }, subtext: data.length + ' 条记录', subtextStyle: { color: '#7f8c8d' } },
    tooltip: { trigger: 'axis', formatter: function(params){
      const time = params[0] ? params[0].axisValue : '';
      let r = `<div style="font-weight:bold; margin-bottom:6px;">${time}</div>`;
      params.forEach(p=>{ const label = names[p.value] != null ? names[p.value] : '无'; r += `<div>${p.marker} ${p.seriesName}: <span style="font-weight:bold">${label}</span></div>`; });
      return r;
    } },
    legend: { data: ['采集设备(inDev)','播放设备(outDev)'], bottom: 10 },
    grid: { left: '3%', right: '4%', bottom: '15%', top: '15%', containLabel: true },
    dataZoom: [ { type: 'inside', start: 0, end: 100, throttle: 50 }, { type: 'slider', start: 0, end: 100, bottom: 40, throttle: 50 } ],
    xAxis: { type: 'category', data: times, axisLabel: { interval: 'auto', rotate: 30, fontSize: 11 }, name: '时间', nameLocation: 'middle', nameGap: 30 },
    yAxis: { type: 'category', data: names, name: '设备名称', axisLabel: { interval: 0 } },
    series: [
      { name: '采集设备(inDev)', type: 'line', step: 'start', data: inSeries, symbol: 'circle', symbolSize: 8, lineStyle: { width: 3, color: '#1abc9c' } },
      { name: '播放设备(outDev)', type: 'line', step: 'start', data: outSeries, symbol: 'circle', symbolSize: 8, lineStyle: { width: 3, color: '#e67e22' } }
    ]
  };
  window.deviceChart.setOption(option);
}


function drawDeviceTypeChart(data){
  const timeSet = new Set(data.map(d=>d.time));
  const times = Array.from(timeSet);

  const typeSet = new Set();
  data.forEach(d=>{ if (d.inDevType) typeSet.add(d.inDevType); if (d.outDevType) typeSet.add(d.outDevType); });
  const types = Array.from(typeSet);
  const typeToIndex = Object.fromEntries(types.map((t,idx)=>[t, idx]));

  const inSeries = times.map(t=>{ const d = data.find(x=>x.time===t && x.inDevType); return d ? typeToIndex[d.inDevType] : null; });
  const outSeries = times.map(t=>{ const d = data.find(x=>x.time===t && x.outDevType); return d ? typeToIndex[d.outDevType] : null; });

  let typeBox = document.getElementById('device-type-chart');
  if (!typeBox){
    const devBox = document.getElementById('device-chart-box');
    if (!devBox) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'chart-container';
    typeBox = document.createElement('div');
    typeBox.id = 'device-type-chart';
    typeBox.className = 'chart';
    wrapper.appendChild(typeBox);
    devBox.appendChild(wrapper);
  }

  const chartDom = document.getElementById('device-type-chart');
  window.deviceTypeChart = echarts.init(chartDom);
  const option = {
    title: { text: '采集/播放设备类型(inDev/outDev)', left: 'center', textStyle: { fontSize: 18, fontWeight: 'bold', color: '#2c3e50' }, subtext: data.length + ' 条记录', subtextStyle: { color: '#7f8c8d' } },
    tooltip: { trigger: 'axis', formatter: function(params){
      const time = params[0] ? params[0].axisValue : '';
      let r = `<div style="font-weight:bold; margin-bottom:6px;">${time}</div>`;
      params.forEach(p=>{ const label = types[p.value] != null ? types[p.value] : '无'; r += `<div>${p.marker} ${p.seriesName}: <span style="font-weight:bold">${label}</span></div>`; });
      return r;
    } },
    legend: { data: ['inDev 类型','outDev 类型'], bottom: 10 },
    grid: { left: '3%', right: '4%', bottom: '15%', top: '15%', containLabel: true },
    dataZoom: [ { type: 'inside', start: 0, end: 100, throttle: 50 }, { type: 'slider', start: 0, end: 100, bottom: 40, throttle: 50 } ],
    xAxis: { type: 'category', data: times, axisLabel: { interval: 'auto', rotate: 30, fontSize: 11 }, name: '时间', nameLocation: 'middle', nameGap: 30 },
    yAxis: { type: 'category', data: types, name: '设备类型', axisLabel: { interval: 0 } },
    series: [
      { name: 'inDev 类型', type: 'line', step: 'start', data: inSeries, symbol: 'circle', symbolSize: 8, lineStyle: { width: 3, color: '#8e44ad' } },
      { name: 'outDev 类型', type: 'line', step: 'start', data: outSeries, symbol: 'circle', symbolSize: 8, lineStyle: { width: 3, color: '#2ecc71' } }
    ]
  };
  window.deviceTypeChart.setOption(option);
}


function drawSessionCountChart(data){
  const timeSet = new Set(data.map(d=>d.time));
  const times = Array.from(timeSet).sort();

  const recSeries = times.map(t=>{
    const d = data.find(x=>x.time===t);
    return d ? d.recordingCount : null;
  });
  const playSeries = times.map(t=>{
    const d = data.find(x=>x.time===t);
    return d ? d.playbackCount : null;
  });

  let chartEl = document.getElementById('device-session-count-chart');
  if (!chartEl){
    const devBox = document.getElementById('device-chart-box');
    if (!devBox) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'chart-container';
    chartEl = document.createElement('div');
    chartEl.id = 'device-session-count-chart';
    chartEl.className = 'chart';
    wrapper.appendChild(chartEl);
    devBox.appendChild(wrapper);
  }

  const chartDom = document.getElementById('device-session-count-chart');
  window.deviceSessionCountChart = echarts.init(chartDom);
  const option = {
    title: { text: '系统采集/播放通道总数', left: 'center', textStyle: { fontSize: 18, fontWeight: 'bold', color: '#2c3e50' }, subtext: data.length + ' 条记录', subtextStyle: { color: '#7f8c8d' } },
    tooltip: {
      trigger: 'axis',
      formatter: function(params){
        const time = params[0] ? params[0].axisValue : '';
        let r = `<div style="font-weight:bold; margin-bottom:6px;">${time}</div>`;
        params.forEach(p=>{
          r += `<div>${p.marker} ${p.seriesName}: <span style="font-weight:bold">${p.value != null ? p.value : '无'}</span></div>`;
        });
        return r;
      }
    },
    legend: { data: ['录制通道(recording)','播放通道(playback)'], bottom: 10 },
    grid: { left: '3%', right: '4%', bottom: '15%', top: '15%', containLabel: true },
    dataZoom: [ { type: 'inside', start: 0, end: 100, throttle: 50 }, { type: 'slider', start: 0, end: 100, bottom: 40, throttle: 50 } ],
    xAxis: { type: 'category', data: times, axisLabel: { interval: 'auto', rotate: 30, fontSize: 11 }, name: '时间', nameLocation: 'middle', nameGap: 30 },
    yAxis: { type: 'value', name: '通道数', min: 0, axisLine: { lineStyle: { color: '#ccc' } }, splitLine: { lineStyle: { type: 'dashed', color: '#eee' } } },
    series: [
    { name: '录制通道(recording)', type: 'line', data: recSeries, connectNulls: true, smooth: true, symbol: 'circle', symbolSize: 7, lineStyle: { width: 3, color: '#34495e' } },
    { name: '播放通道(playback)', type: 'line', data: playSeries, connectNulls: true, smooth: true, symbol: 'circle', symbolSize: 7, lineStyle: { width: 3, color: '#d35400' } }
    ]
  };
  window.deviceSessionCountChart.setOption(option);
}


// 新增：绘制slmdd检测次数趋势图
function drawSlmddChart(data){
  if (!data || data.length === 0) return;

  // 时间排序
  const times = data.map(d=>d.time).sort();
  const counts = times.map(t => {
    const d = data.find(x => x.time === t);
    return d ? d.count : null;
  });

  // 创建DOM容器
  let slmddDom = document.getElementById('slmdd-chart');
  if (!slmddDom){
    const devBox = document.getElementById('device-chart-box');
    if (!devBox) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'chart-container';
    slmddDom = document.createElement('div');
    slmddDom.id = 'slmdd-chart';
    slmddDom.className = 'chart';
    wrapper.appendChild(slmddDom);
    devBox.appendChild(wrapper);
  }

  const slmddChart = echarts.init(slmddDom);

  const option = {
    title: {
      text: '同地多设备 SLMDD 检测次数',
      left: 'center',
      textStyle: { fontSize: 18, fontWeight: 'bold', color: '#2c3e50' },
      subtext: `${data.length} 个采样`,
      subtextStyle: { color: '#7f8c8d' }
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255,255,255,0.95)',
      borderColor: '#ddd',
      borderWidth: 1,
      textStyle: { color: '#333' },
      formatter: function(params){
        const time = params[0]?.axisValue || '';
        const val = params[0]?.value ?? '无数据';
        return `<div style="font-weight:bold; margin-bottom:6px;">时间: ${time}</div><div>${params[0].marker} SLMDD检测次数: <strong>${val}</strong></div>`;
      }
    },
    legend: { data: ['检测次数'], bottom: 10 },
    grid: { left: '3%', right: '4%', bottom: '15%', top: '15%', containLabel: true },
    toolbox: { feature: { saveAsImage: { title: '保存为图片', pixelRatio: 2 }, dataZoom: { title: { zoom: '区域缩放', back: '缩放还原' } } } },
    dataZoom: [ { type: 'inside', start: 0, end: 100, throttle: 50 }, { type: 'slider', start: 0, end: 100, bottom: 40, throttle: 50 } ],
    xAxis: {
      type: 'category',
      data: times,
      axisLabel: { interval: 'auto', rotate: 30, fontSize: 11 },
      name: '时间',
      nameLocation: 'middle',
      nameGap: 30,
      axisLine: { lineStyle: { color: '#ccc' } }
    },
    yAxis: {
      type: 'value',
      name: '检测次数',
      min: 0,
      axisLine: { lineStyle: { color: '#ccc' } },
      splitLine: { lineStyle: { type: 'dashed', color: '#eee' } }
    },
    series: [
      {
        name: '检测次数',
        type: 'line',
        data: counts,
        smooth: true,
        symbol: 'circle',
        symbolSize: 7,
        lineStyle: { width: 3, color: '#9b59b6' },
        itemStyle: { color: '#9b59b6' }
      }
    ]
  };

  slmddChart.setOption(option);
  window.slmddChart = slmddChart;
}


function drawDeltaChart(data) {
  const timeSet = new Set(data.map(d => d.time));
  const times = Array.from(timeSet).sort();

  const MAX_VALID_DELTA = 100000; // 100000 ms = 100秒，阈值，超过视为无效

  // 过滤大值为null
  const deltaCapSeries = times.map(t => {
    const d = data.find(x => x.time === t);
    if (d && d.deltaCap != null && d.deltaCap < MAX_VALID_DELTA) {
      return Number(d.deltaCap);
    } else {
      return null;
    }
  });
  const deltaPlaySeries = times.map(t => {
    const d = data.find(x => x.time === t);
    if (d && d.deltaPlay != null && d.deltaPlay < MAX_VALID_DELTA) {
      return Number(d.deltaPlay);
    } else {
      return null;
    }
  });

  let deltaChartDom = document.getElementById('delta-chart');
  if (!deltaChartDom) {
    const devBox = document.getElementById('device-chart-box');
    if (!devBox) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'chart-container';
    deltaChartDom = document.createElement('div');
    deltaChartDom.id = 'delta-chart';
    deltaChartDom.className = 'chart';
    wrapper.appendChild(deltaChartDom);
    devBox.appendChild(wrapper);
  }

  const deltaChart = echarts.init(deltaChartDom);
  const option = {
    title: {
      text: '采集和播放 Delta 时间间隔 (ms)',
      left: 'center',
      textStyle: { fontSize: 18, fontWeight: 'bold', color: '#2c3e50' },
      subtext: `${data.length} 条采样`,
      subtextStyle: { color: '#7f8c8d' }
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255,255,255,0.95)',
      borderColor: '#ddd',
      borderWidth: 1,
      textStyle: { color: '#333' },
      formatter: function(params){
        const time = params[0]?.axisValue || '';
        let r = `<div style="font-weight:bold; margin-bottom:8px;">时间: ${time}</div>`;
        params.forEach(p=>{
          const val = p.value != null ? p.value : '无数据';
          r += `<div>${p.marker} ${p.seriesName}: <span style="font-weight:bold">${val} ms</span></div>`;
        });
        return r;
      }
    },
    legend: { data: ['采集 Delta', '播放 Delta'], bottom: 10 },
    grid: { left: '3%', right: '4%', bottom: '15%', top: '15%', containLabel: true },
    toolbox: {
      feature: {
        saveAsImage: { title: '保存为图片', pixelRatio: 2 },
        dataZoom: { title: { zoom: '区域缩放', back: '缩放还原' } }
      }
    },
    dataZoom: [
      { type: 'inside', start: 0, end: 100, throttle: 50 },
      { type: 'slider', start: 0, end: 100, bottom: 40, throttle: 50 }
    ],
    xAxis: {
      type: 'category',
      data: times,
      axisLabel: { interval: 'auto', rotate: 30, fontSize: 11 },
      name: '时间',
      nameLocation: 'middle',
      nameGap: 30,
      axisLine: { lineStyle: { color: '#ccc' } }
    },
    yAxis: {
      type: 'value',
      name: '时间间隔 (ms)',
      min: 0,
      scale: true,
      axisLine: { lineStyle: { color: '#ccc' } },
      splitLine: { lineStyle: { type: 'dashed', color: '#eee' } }
    },
    series: [
      {
        name: '采集 Delta',
        type: 'line',
        data: deltaCapSeries,
        smooth: true,
        symbol: 'circle',
        symbolSize: 7,
        lineStyle: { width: 3, color: '#3498db' },
        itemStyle: { color: '#3498db' }
      },
      {
        name: '播放 Delta',
        type: 'line',
        data: deltaPlaySeries,
        smooth: true,
        symbol: 'circle',
        symbolSize: 7,
        lineStyle: { width: 3, color: '#e74c3c' },
        itemStyle: { color: '#e74c3c' }
      }
    ]
  };
  window.deltaChart = deltaChart;
  deltaChart.setOption(option);
}




export function parseAndDrawDevice(logString){
  const {
    micResults,
    muteResults,
    meterResults,
    deviceNameResults,
    volumeResults,
    deviceTypeResults,
    sessionCountResults,
    deltaResults,  // 新增返回
    slmddResults   // 新增返回
  } = parseDevice(logString);

  const micBox = document.getElementById('mic-chart-box');
  const meterBox = document.getElementById('meter-chart-box');
  const devBox = document.getElementById('device-chart-box');

  if (micResults.length || muteResults.length){
    drawMicChart(micResults, muteResults);
    if (micBox) micBox.style.display = 'block';
  } else {
    if (micBox) micBox.style.display = 'none';
  }

  if (meterResults.length){
    drawMeterChart(meterResults);
    if (meterBox) meterBox.style.display = 'block';
  } else {
    if (meterBox) meterBox.style.display = 'none';
  }

  let anythingInDevBox = false;

  const deviceChartDom = document.getElementById('device-chart');
  if (deviceNameResults.length && deviceChartDom){
    drawDeviceNamesChart(deviceNameResults);
    anythingInDevBox = true;
  }

  if (volumeResults.length){
    let volDom = document.getElementById('device-volume-chart');
    if (!volDom && devBox){
      const wrapper = document.createElement('div');
      wrapper.className = 'chart-container';
      const chart = document.createElement('div');
      chart.id = 'device-volume-chart';
      chart.className = 'chart';
      wrapper.appendChild(chart);
      devBox.appendChild(wrapper);
    }
    drawDeviceVolumeChart(volumeResults);
    anythingInDevBox = true;
  }

  if (deviceTypeResults.length){
    drawDeviceTypeChart(deviceTypeResults);
    anythingInDevBox = true;
  }

  if (sessionCountResults.length){
    drawSessionCountChart(sessionCountResults);
    anythingInDevBox = true;
  }

  if (deltaResults.length){
    drawDeltaChart(deltaResults);
    anythingInDevBox = true;
  }

  // 新增绘制同地多设备 slmdd 检测图
  if (slmddResults.length){
    drawSlmddChart(slmddResults);
    anythingInDevBox = true;
  }

  if (devBox) devBox.style.display = anythingInDevBox ? 'block' : 'none';

  return { micResults, muteResults, meterResults, deviceNameResults, volumeResults, deviceTypeResults, sessionCountResults, deltaResults, slmddResults };
}