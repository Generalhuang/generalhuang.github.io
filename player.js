// 1. 日志解析 (这部分保持不变)
export function parsePlayer(logString){
  const lines = logString.split(/\r?\n/);
  const results = {
    decoder: [],
    jitter: [],
    demuxer: [],
    player: []
  };
  let currentTime = null;
  for (let line of lines){
    const tsMatch = line.match(/^(\d{2}:\d{2}:\d{2}\.\d{3})\|/);
    if (tsMatch) currentTime = tsMatch[1].split('.')[0]; // HH:mm:ss
    if (!currentTime) continue;
    // decoder
    if (line.includes('buffer statis:decoder:')){
      const inframe = extractInt(line, /inframe=(\d+)/);
      const decframe = extractInt(line, /decframe=(\d+)/);
      const outframe = extractInt(line, /outframe=(\d+)/);
      results.decoder.push({ time: currentTime, inframe, decframe, outframe });
    }
    // jitter
    else if (line.includes('buffer statis:jitter:')){
      const inframe = extractInt(line, /inframe=(\d+)/);
      const outframe = extractInt(line, /outframe=(\d+)/);
      results.jitter.push({ time: currentTime, inframe, outframe });
    }
    // demuxer
    else if (line.includes('buffer statis:demuxer:')){
      const inframe = extractInt(line, /inframe=(\d+)/);
      const flushframe = extractInt(line, /flushframe=(\d+)/);
      const outframe = extractInt(line, /outframe=(\d+)/);
      results.demuxer.push({ time: currentTime, inframe, flushframe, outframe });
    }
    // player
    else if (line.includes('buffer statis:player:')){
      const matchTime = line.match(/total_buffer:time=(\d+)(?:\/[\d.]+s)?/);
      const outputFrames = extractInt(line, /output_frames=(\d+)/);
      const inputFrame = matchTime ? parseInt(matchTime[1]) : null;
      results.player.push({ time: currentTime, inputFrame, outputFrames });
    }
  }
  return results;
  function extractInt(str, regex){
    const m = str.match(regex);
    return m ? parseInt(m[1]) : null;
  }
}


// 3. 图表绘制 (已更新所有图表的配置)
export function drawPlayerChart(data){
  const chartDom = document.getElementById('player-chart');
  if (!chartDom) return;
  window.playerChart = echarts.getInstanceByDom(chartDom) || echarts.init(chartDom);
  const times = data.player.map(d => d.time);
  const inputFrames = data.player.map(d => d.inputFrame);
  const outputFrames = data.player.map(d => d.outputFrames);
  const option = {
    title: { text: '播放器帧数统计', left: 'center', textStyle: { fontSize: 18, fontWeight: 'bold', color: '#2c3e50' },
      subtext: `${data.player.length} 个采样点`, subtextStyle: { color: '#7f8c8d' }
    },
    // 修改：优化 tooltip 交互，增加十字准星
    tooltip: { 
        trigger: 'axis',
        axisPointer: {
            type: 'cross',
            label: { backgroundColor: '#6a7985' }
        }
    },
    legend: { data: ['输入帧数(inputFrame)', '输出帧数(outputFrames)'], bottom: 10 },
    grid: { left: '5%', right: '5%', bottom: '15%', top: '15%', containLabel: true },
    dataZoom: [
      { type: 'inside', start: 0, end: 100, throttle: 50 },
      { type: 'slider', start: 0, end: 100, bottom: 40, throttle: 50 }
    ],
    xAxis: { type: 'category', data: times, axisLabel: { interval: 'auto', rotate: 30, fontSize: 11 } },
    yAxis: { type: 'value', name: '帧数', min: 0 },
    series: [
      { 
        name: '输入帧数(inputFrame)', type: 'line', data: inputFrames, smooth: true, 
        showSymbol: false, // 默认不显示点，以保持线条清晰
        lineStyle: { color: '#3498db', width: 3 },
        // 新增：鼠标悬浮高亮配置
        emphasis: {
            focus: 'series', // 高亮整条线
            itemStyle: { borderWidth: 2, borderColor: '#fff' } // 显示数据点
        }
      },
      { 
        name: '输出帧数(outputFrames)', type: 'line', data: outputFrames, smooth: true, 
        showSymbol: false,
        lineStyle: { color: '#e74c3c', width: 3 },
        // 新增：鼠标悬浮高亮配置
        emphasis: {
            focus: 'series',
            itemStyle: { borderWidth: 2, borderColor: '#fff' }
        }
      }
    ]
  };
  window.playerChart.setOption(option, true);
}

export function drawDecoderChart(data){
  const chartDom = document.getElementById('decoder-chart');
  if (!chartDom) return;
  window.decoderChart = echarts.getInstanceByDom(chartDom) || echarts.init(chartDom);
  const times = data.decoder.map(d => d.time);
  const inFrames = data.decoder.map(d => d.inframe);
  const decFrames = data.decoder.map(d => d.decframe);
  const outFrames = data.decoder.map(d => d.outframe);
  const option = {
    title: {text: '解码器帧数统计', left: 'center', textStyle: { fontSize: 18 }},
    // 修改：优化 tooltip 交互
    tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross', label: { backgroundColor: '#6a7985' } }
    },
    legend: {data: ['输入帧', '解码帧', '输出帧'], bottom: 10},
    grid: { left: '5%', right: '5%', bottom: '15%', top: '15%', containLabel: true },
    dataZoom: [ {type:'inside', start:0, end:100}, {type:'slider', start:0, end:100, bottom:40} ],
    xAxis: {type: 'category', data: times, axisLabel: { rotate: 30, fontSize: 11 }},
    yAxis: {type: 'value', name: '帧数', min: 0},
    series: [
      {name: '输入帧', type: 'line', data: inFrames, smooth: true, showSymbol:false, lineStyle: { color:'#4bc07d' }, emphasis: { focus: 'series' }},
      {name: '解码帧', type: 'line', data: decFrames, smooth: true, showSymbol:false, lineStyle: { color:'#7f8c8d' }, emphasis: { focus: 'series' }},
      {name: '输出帧', type: 'line', data: outFrames, smooth: true, showSymbol:false, lineStyle: { color:'#f39c12' }, emphasis: { focus: 'series' }}
    ]
  };
  window.decoderChart.setOption(option, true);
}

export function drawJitterChart(data){
  const chartDom = document.getElementById('jitter-chart');
  if (!chartDom) return;
  window.jitterChart = echarts.getInstanceByDom(chartDom) || echarts.init(chartDom);
  const times = data.jitter.map(d => d.time);
  const inFrames = data.jitter.map(d => d.inframe);
  const outFrames = data.jitter.map(d => d.outframe);
  const option = {
    title: {text: '抖动缓存帧数统计', left: 'center', textStyle: { fontSize: 18 }},
    // 修改：优化 tooltip 交互
    tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross', label: { backgroundColor: '#6a7985' } }
    },
    legend: {data: ['输入帧', '输出帧'], bottom: 10},
    grid: { left: '5%', right: '5%', bottom: '15%', top: '15%', containLabel: true },
    dataZoom: [ {type:'inside', start:0, end:100}, {type:'slider', start:0, end:100, bottom:40} ],
    xAxis: {type: 'category', data: times, axisLabel: { rotate: 30, fontSize: 11 }},
    yAxis: {type: 'value', name: '帧数', min: 0},
    series: [
      {name: '输入帧', type: 'line', data: inFrames, smooth: true, showSymbol:false, lineStyle: { color:'#2b77da' }, emphasis: { focus: 'series' }},
      {name: '输出帧', type: 'line', data: outFrames, smooth: true, showSymbol:false, lineStyle: { color:'#e74c3c' }, emphasis: { focus: 'series' }}
    ]
  };
  window.jitterChart.setOption(option, true);
}

export function drawDemuxerChart(data){
  const chartDom = document.getElementById('demuxer-chart');
  if (!chartDom) return;
  window.demuxerChart = echarts.getInstanceByDom(chartDom) || echarts.init(chartDom);
  const times = data.demuxer.map(d => d.time);
  const inFrames = data.demuxer.map(d => d.inframe);
  const flushFrames = data.demuxer.map(d => d.flushframe);
  const outFrames = data.demuxer.map(d => d.outframe);
  const option = {
    title: {text: '分离器帧数统计', left:'center', textStyle: { fontSize: 18 }},
    // 修改：优化 tooltip 交互
    tooltip: { 
        trigger: 'axis',
        axisPointer: { type: 'cross', label: { backgroundColor: '#6a7985' } }
    },
    legend: { data: ['输入帧', '刷新帧', '输出帧'], bottom: 10 },
    grid: { left: '5%', right: '5%', bottom: '15%', top: '15%', containLabel: true },
    dataZoom: [ {type:'inside', start:0, end:100}, {type:'slider', start:0, end:100, bottom:40} ],
    xAxis: {type: 'category', data: times, axisLabel: { rotate: 30, fontSize: 11 }},
    yAxis: {type:'value', name:'帧数', min:0},
    series: [
      {name: '输入帧', type: 'line', data: inFrames, smooth: true, showSymbol:false, lineStyle: { color:'#2980b9' }, emphasis: { focus: 'series' }},
      {name: '刷新帧', type: 'line', data: flushFrames, smooth: true, showSymbol:false, lineStyle: { color:'#95a5a6' }, emphasis: { focus: 'series' }},
      {name:'输出帧', type:'line', data:outFrames, smooth:true, showSymbol:false, lineStyle: { color:'#16a085' }, emphasis: { focus: 'series' }}
    ]
  };
  window.demuxerChart.setOption(option, true);
}

// 4. 总入口 (保持不变)
export function parseAndDrawPlayer(logString){
  const data = parsePlayer(logString);

  if (data.player && data.player.length > 0) {
    drawPlayerChart(data);
  }
  if (data.decoder && data.decoder.length > 0) {
    drawDecoderChart(data);
  }
  if (data.jitter && data.jitter.length > 0) {
    drawJitterChart(data);
  }
  if (data.demuxer && data.demuxer.length > 0) {
    drawDemuxerChart(data);
  }

  return data;
}