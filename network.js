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


function parseNetwork(logString){
  const lines = logString.split(/\r?\n/);
  const rttResults = [];
  const dropResults = [];
  const localSendResults = [];
  const receiveResults = new Map(); // 按接收用户ID分组
  const bufferSResults = new Map(); // 按 UID 分组存 BufferS数据，格式：[{time, bufferS: number[9]}]
  const { parseTimeStr, formatTime } = parseTimeHelpers();
  let currentTimeWithMs = null;
  let currentSenderId = null;

  console.log('=== 开始解析网络数据 ===');
  console.log('总行数:', lines.length);

  for (let i=0;i<lines.length;i++){
    const raw = lines[i];
    const line = raw.trim();

    const timePrefixMatch = line.match(/^(\d{2}:\d{2}:\d{2}\.\d{3})\|[IEW]\|/);
    if (timePrefixMatch) currentTimeWithMs = timePrefixMatch[1];

    const timeStr = line.slice(0,12).split('.')[0];
    const curTime = (currentTimeWithMs ? currentTimeWithMs : '').split('.')[0] || timeStr;

    // 解析发送端ID (account后面的数字)
    if (line.includes('account(') && line.includes('relation_id(')){
      const accountMatch = line.match(/account\((\d+)\)/);
      if (accountMatch && curTime){
        currentSenderId = accountMatch[1];
        console.log('找到发送端ID:', curTime, currentSenderId);
      }
    }

    // 解析 RTT
    if (line.includes('RTT:')){
      const rttMatch = line.match(/RTT:(\d+)/);
      if (rttMatch && curTime){
        const rtt = parseInt(rttMatch[1], 10);
        rttResults.push({ time: curTime, rtt });
        console.log('找到RTT:', curTime, rtt);
      }
    }

    // 解析网络丢包时长
    if (line.includes('AUDIO-MONITOR') && line.includes('find drop')){
      const dropMatch = line.match(/max_drop:(\d+)/);
      if (dropMatch && curTime){
        const dropDuration = parseInt(dropMatch[1], 10);
        dropResults.push({ time: curTime, dropDuration });
        console.log('成功解析丢包:', curTime, dropDuration, 'ms');
      }
    }

    // 解析本地发包数据 (period-audio:数字) - 合并发送端ID
    if (line.includes('period-audio:') && !line.includes('[')){
      const sendMatch = line.match(/period-audio:(\d+)/);
      if (sendMatch && curTime && currentSenderId){
        const sendCount = parseInt(sendMatch[1], 10);
        localSendResults.push({ 
          time: curTime, 
          sendCount, 
          senderId: currentSenderId 
        });
        console.log('找到本地发包:', curTime, sendCount, '发送端ID:', currentSenderId);
      }
    }

    // 解析收包数据 (period-audio[用户ID]:数字)
    if (line.includes('period-audio[') && line.includes(']:')){
      const receiveMatch = line.match(/period-audio\[(\d+)\]:(\d+)/);
      if (receiveMatch && curTime){
        const receiverId = receiveMatch[1];
        const receiveCount = parseInt(receiveMatch[2], 10);
        
        if (!receiveResults.has(receiverId)) {
          receiveResults.set(receiverId, []);
        }
        receiveResults.get(receiverId).push({ time: curTime, receiveCount });
        console.log('找到收包数据:', curTime, '接收端ID:', receiverId, '收包数:', receiveCount);
      }
    }

    // 解析 JBM...UID...BufferS: 后面9个数字，统计 jitter
    if (line.includes('UID[') && line.includes('BufferS:')){
      // 提取 UID
      const uidMatch = line.match(/UID\[(\d+)\]/);
      const bufferSMatch = line.match(/BufferS:([0-9,]+)/);
      if (uidMatch && bufferSMatch && curTime){
        const uid = uidMatch[1];
        const bufferSStr = bufferSMatch[1];
        const bufferSArr = bufferSStr.split(',').map(Number);
        if(bufferSArr.length === 9){
          if (!bufferSResults.has(uid)){
            bufferSResults.set(uid, []);
          }
          bufferSResults.get(uid).push({ time: curTime, bufferS: bufferSArr });
          console.log(`解析到UID[${uid}]的BufferS数据: `, bufferSArr);
        }
      }
    }
  }

  console.log('=== 解析结果 ===');
  console.log('RTT结果数量:', rttResults.length);
  console.log('丢包结果数量:', dropResults.length);
  console.log('本地发包结果数量:', localSendResults.length);
  console.log('收包用户数量:', receiveResults.size);
  console.log('收包用户IDs:', Array.from(receiveResults.keys()));
  console.log('BufferS用户数量:', bufferSResults.size);
  console.log('BufferS用户IDs:', Array.from(bufferSResults.keys()));

  return { rttResults, dropResults, localSendResults, receiveResults, bufferSResults };
}


function drawRttChart(data){
  const times = data.map(d=>d.time);
  const rtts = data.map(d=>d.rtt);
  const chartDom = document.getElementById('network-chart');
  window.networkChart = echarts.init(chartDom);
  const option = {
    title: { text: '网络RTT延迟', left: 'center', textStyle: { fontSize: 18, fontWeight: 'bold', color: '#2c3e50' }, subtext: data.length + ' 个采样点', subtextStyle: { color: '#7f8c8d' } },
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(255,255,255,0.95)', borderColor: '#ddd', borderWidth: 1, textStyle: { color: '#333' }, formatter: function(params){ let r = `<div style="font-weight:bold; margin-bottom:8px;">时间: ${params[0].axisValue}</div>`; params.forEach(p=>{ r += `<div>${p.marker} ${p.seriesName}: <span style="font-weight:bold">${p.value} ms</span></div>`; }); return r; } },
    legend: { data: ['RTT延迟'], bottom: 10 },
    grid: { left: '3%', right: '4%', bottom: '15%', top: '15%', containLabel: true },
    toolbox: { feature: { saveAsImage: { title: '保存为图片', pixelRatio: 2 }, dataZoom: { title: { zoom: '区域缩放', back: '缩放还原' } } } },
    dataZoom: [ { type: 'inside', start: 0, end: 100, throttle: 50 }, { type: 'slider', start: 0, end: 100, bottom: 40, throttle: 50 } ],
    xAxis: { type: 'category', data: times, axisLabel: { interval: 'auto', rotate: 30, fontSize: 11 }, name: '时间', nameLocation: 'middle', nameGap: 30, axisLine: { lineStyle: { color: '#ccc' } } },
    yAxis: { type: 'value', name: 'RTT (ms)', axisLine: { lineStyle: { color: '#ccc' } }, splitLine: { lineStyle: { type: 'dashed', color: '#eee' } } },
    series: [
      { name: 'RTT延迟', type: 'line', data: rtts, smooth: true, symbol: 'circle', symbolSize: 6, lineStyle: { width: 3, color: '#3498db' }, itemStyle: { color: '#3498db' } }
    ]
  };
  window.networkChart.setOption(option);
}


function drawDropChart(data){
  const times = data.map(d=>d.time);
  const drops = data.map(d=>d.dropDuration);
  
  let chartEl = document.getElementById('network-drop-chart');
  if (!chartEl){
    const networkBox = document.getElementById('network-chart-box');
    if (!networkBox) return;
    
    const wrapper = document.createElement('div');
    wrapper.className = 'chart-container';
    chartEl = document.createElement('div');
    chartEl.id = 'network-drop-chart';
    chartEl.className = 'chart';
    wrapper.appendChild(chartEl);
    networkBox.appendChild(wrapper);
  }

  window.networkDropChart = echarts.init(chartEl);
  const option = {
    title: { text: '网络丢包时长统计', left: 'center', textStyle: { fontSize: 18, fontWeight: 'bold', color: '#2c3e50' }, subtext: data.length + ' 个丢包事件', subtextStyle: { color: '#7f8c8d' } },
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(255,255,255,0.95)', borderColor: '#ddd', borderWidth: 1, textStyle: { color: '#333' }, formatter: function(params){ let r = `<div style="font-weight:bold; margin-bottom:8px;">时间: ${params[0].axisValue}</div>`; params.forEach(p=>{ r += `<div>${p.marker} ${p.seriesName}: <span style="font-weight:bold">${p.value} ms</span></div>`; }); return r; } },
    legend: { data: ['丢包时长'], bottom: 10 },
    grid: { left: '3%', right: '4%', bottom: '15%', top: '15%', containLabel: true },
    toolbox: { feature: { saveAsImage: { title: '保存为图片', pixelRatio: 2 }, dataZoom: { title: { zoom: '区域缩放', back: '缩放还原' } } } },
    dataZoom: [ { type: 'inside', start: 0, end: 100, throttle: 50 }, { type: 'slider', start: 0, end: 100, bottom: 40, throttle: 50 } ],
    xAxis: { type: 'category', data: times, axisLabel: { interval: 'auto', rotate: 30, fontSize: 11 }, name: '时间', nameLocation: 'middle', nameGap: 30, axisLine: { lineStyle: { color: '#ccc' } } },
    yAxis: { type: 'value', name: '丢包时长 (ms)', axisLine: { lineStyle: { color: '#ccc' } }, splitLine: { lineStyle: { type: 'dashed', color: '#eee' } } },
    series: [
      { name: '丢包时长', type: 'line', data: drops, smooth: true, symbol: 'circle', symbolSize: 8, lineStyle: { width: 3, color: '#e74c3c' }, itemStyle: { color: '#e74c3c' }, markPoint: { data: [ { type: 'max', name: '最大丢包' }, { type: 'min', name: '最小丢包' } ] } }
    ]
  };
  window.networkDropChart.setOption(option);
}


function drawLocalSendChart(data){
  // 按发送端ID分组数据
  const senderGroups = new Map();
  data.forEach(item => {
    if (!senderGroups.has(item.senderId)) {
      senderGroups.set(item.senderId, []);
    }
    senderGroups.get(item.senderId).push(item);
  });

  // 为每个发送端ID创建图表
  senderGroups.forEach((senderData, senderId) => {
    const times = senderData.map(d=>d.time);
    const sendCounts = senderData.map(d=>d.sendCount);
    
    let chartEl = document.getElementById(`network-local-send-${senderId}-chart`);
    if (!chartEl){
      const networkBox = document.getElementById('network-chart-box');
      if (!networkBox) return;
      
      const wrapper = document.createElement('div');
      wrapper.className = 'chart-container';
      chartEl = document.createElement('div');
      chartEl.id = `network-local-send-${senderId}-chart`;
      chartEl.className = 'chart';
      wrapper.appendChild(chartEl);
      networkBox.appendChild(wrapper);
    }

    window[`networkLocalSendChart_${senderId}`] = echarts.init(chartEl);
    const option = {
      title: { text: `发送端ID: ${senderId} 发包统计`, left: 'center', textStyle: { fontSize: 18, fontWeight: 'bold', color: '#2c3e50' }, subtext: senderData.length + ' 个记录', subtextStyle: { color: '#7f8c8d' } },
      tooltip: { trigger: 'axis', backgroundColor: 'rgba(255,255,255,0.95)', borderColor: '#ddd', borderWidth: 1, textStyle: { color: '#333' }, formatter: function(params){ let r = `<div style="font-weight:bold; margin-bottom:8px;">时间: ${params[0].axisValue}</div>`; params.forEach(p=>{ r += `<div>${p.marker} ${p.seriesName}: <span style="font-weight:bold">${p.value}</span></div>`; }); return r; } },
      legend: { data: ['发包数'], bottom: 10 },
      grid: { left: '3%', right: '4%', bottom: '15%', top: '15%', containLabel: true },
      dataZoom: [ { type: 'inside', start: 0, end: 100, throttle: 50 }, { type: 'slider', start: 0, end: 100, bottom: 40, throttle: 50 } ],
      xAxis: { type: 'category', data: times, axisLabel: { interval: 'auto', rotate: 30, fontSize: 11 }, name: '时间', nameLocation: 'middle', nameGap: 30, axisLine: { lineStyle: { color: '#ccc' } } },
      yAxis: { type: 'value', name: '发包数', axisLine: { lineStyle: { color: '#ccc' } }, splitLine: { lineStyle: { type: 'dashed', color: '#eee' } } },
      series: [
        { name: '发包数', type: 'line', data: sendCounts, smooth: true, symbol: 'circle', symbolSize: 6, lineStyle: { width: 3, color: '#2ecc71' }, itemStyle: { color: '#2ecc71' } }
      ]
    };
    window[`networkLocalSendChart_${senderId}`].setOption(option);
  });
}


function drawReceiveChart(receiveData, receiverId){
  const times = receiveData.map(d=>d.time);
  const receiveCounts = receiveData.map(d=>d.receiveCount);
  
  let chartEl = document.getElementById(`network-receive-${receiverId}-chart`);
  if (!chartEl){
    const networkBox = document.getElementById('network-chart-box');
    if (!networkBox) return;
    
    const wrapper = document.createElement('div');
    wrapper.className = 'chart-container';
    chartEl = document.createElement('div');
    chartEl.id = `network-receive-${receiverId}-chart`;
    chartEl.className = 'chart';
    wrapper.appendChild(chartEl);
    networkBox.appendChild(wrapper);
  }

  window[`networkReceiveChart_${receiverId}`] = echarts.init(chartEl);
  const option = {
    title: { text: `接收端ID: ${receiverId} 收包统计`, left: 'center', textStyle: { fontSize: 18, fontWeight: 'bold', color: '#2c3e50' }, subtext: receiveData.length + ' 个记录', subtextStyle: { color: '#7f8c8d' } },
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(255,255,255,0.95)', borderColor: '#ddd', borderWidth: 1, textStyle: { color: '#333' }, formatter: function(params){ let r = `<div style="font-weight:bold; margin-bottom:8px;">时间: ${params[0].axisValue}</div>`; params.forEach(p=>{ r += `<div>${p.marker} ${p.seriesName}: <span style="font-weight:bold">${p.value}</span></div>`; }); return r; } },
    legend: { data: ['收包数'], bottom: 10 },
    grid: { left: '3%', right: '4%', bottom: '15%', top: '15%', containLabel: true },
    dataZoom: [ { type: 'inside', start: 0, end: 100, throttle: 50 }, { type: 'slider', start: 0, end: 100, bottom: 40, throttle: 50 } ],
    xAxis: { type: 'category', data: times, axisLabel: { interval: 'auto', rotate: 30, fontSize: 11 }, name: '时间', nameLocation: 'middle', nameGap: 30, axisLine: { lineStyle: { color: '#ccc' } } },
    yAxis: { type: 'value', name: '收包数', axisLine: { lineStyle: { color: '#ccc' } }, splitLine: { lineStyle: { type: 'dashed', color: '#eee' } } },
    series: [
      { name: '收包数', type: 'line', data: receiveCounts, smooth: true, symbol: 'circle', symbolSize: 6, lineStyle: { width: 3, color: '#f39c12' }, itemStyle: { color: '#f39c12' } }
    ]
  };
  window[`networkReceiveChart_${receiverId}`].setOption(option);
}


function drawBufferSChart(data, uid){
  const times = data.map(d=>d.time);
  const seriesData = [];
  const names = [
    '峰值标识(0无1有)', 
    'jitter估计的buffer(ms)', 
    'jitter目标的buffer(ms)', 
    '滤波后的buffer(ms)', 
    '当前buffer(ms)', 
    '加速数据(ms)', 
    '减速数据(ms)', 
    '补偿数据(ms)', 
    '丢失数据(ms)'
  ];
  const colors = ['#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4', '#46f0f0', '#f032e6', '#bcf60c'];

  for (let i=0; i<9; ++i){
    seriesData.push({
      name: names[i],
      type: 'line',
      data: data.map(d => d.bufferS[i]),
      smooth: true,
      symbol: 'circle',
      symbolSize: 5,
      lineStyle: { width: 2, color: colors[i] },
      itemStyle: { color: colors[i] }
    });
  }

  let chartEl = document.getElementById(`network-bufferS-${uid}-chart`);
  if (!chartEl){
    const networkBox = document.getElementById('network-chart-box');
    if (!networkBox) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'chart-container';
    chartEl = document.createElement('div');
    chartEl.id = `network-bufferS-${uid}-chart`;
    chartEl.className = 'chart';
    wrapper.appendChild(chartEl);
    networkBox.appendChild(wrapper);
  }

  const chart = echarts.init(chartEl);

  const option = {
    title: {
      text: `接收端ID: ${uid} BufferS数据统计`,
      left: 'center',
      textStyle: { fontSize: 18, fontWeight: 'bold', color: '#2c3e50' },
      subtext: `${data.length} 个记录`,
      subtextStyle: { color: '#7f8c8d' }
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255,255,255,0.95)',
      borderColor: '#ddd',
      borderWidth: 1,
      textStyle: { color: '#333' },
      formatter: function(params){
        let r = `<div style="font-weight:bold; margin-bottom:8px;">时间: ${params[0].axisValue}</div>`;
        params.forEach(p => {
          r += `<div>${p.marker} ${p.seriesName}: <span style="font-weight:bold">${p.value}</span></div>`;
        });
        return r;
      }
    },
    legend: { data: names, bottom: 10, type: 'scroll' },
    grid: { left: '4%', right: '4%', bottom: '20%', top: '15%', containLabel: true },
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
      name: '时间(ms)或标识',
      axisLine: { lineStyle: { color: '#ccc' } },
      splitLine: { lineStyle: { type: 'dashed', color: '#eee' } }
    },
    series: seriesData
  };

  chart.setOption(option);
  window[`networkBufferSChart_${uid}`] = chart;
}


export function parseAndDrawNetwork(logString){
  const { rttResults, dropResults, localSendResults, receiveResults, bufferSResults } = parseNetwork(logString);
  const networkBox = document.getElementById('network-chart-box');

  if (rttResults.length){
    drawRttChart(rttResults);
    if (networkBox) networkBox.style.display = 'block';
  } else if (networkBox){
    networkBox.style.display = 'none';
  }

  if (dropResults.length){
    drawDropChart(dropResults);
  }

  if (localSendResults.length){
    drawLocalSendChart(localSendResults);
  }

  if (receiveResults.size > 0){
    receiveResults.forEach((receiveData, receiverId) => {
      drawReceiveChart(receiveData, receiverId);
    });
  }

  if (bufferSResults.size > 0){
    bufferSResults.forEach((bufferSData, uid) => {
      drawBufferSChart(bufferSData, uid);
    });
  }

  return { rttResults, dropResults, localSendResults, receiveResults, bufferSResults };
}