function parsePerformance(logString){
  const lines = logString.split(/\r?\n/);
  const cpuResults = [];
  const memoryResults = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const timeStr = line.slice(0,12).split('.')[0];
    if (line.startsWith('Sys[CPU:')) {
      const appMatch = line.match(/CPU:(\d+\.\d+)%\(App\)/);
      const sysMatch = line.match(/(\d+\.\d+)%\(Sys\)/);
      if (appMatch && sysMatch && timeStr) {
        cpuResults.push({ time: timeStr, app_cpu: parseFloat(appMatch[1]), sys_cpu: parseFloat(sysMatch[1]) });
      }
      const tmMatch = line.match(/TM:(\d+\.?\d*)/);
      const fmMatch = line.match(/FM:(\d+\.?\d*)/);
      const procMatch = line.match(/Proc:(\d+\.?\d*)/);
      if (tmMatch && fmMatch && procMatch && timeStr) {
        memoryResults.push({ time: timeStr, tm: parseFloat(tmMatch[1]), fm: parseFloat(fmMatch[1]), proc: parseFloat(procMatch[1]) });
      }
    }
  }
  return { cpuResults, memoryResults };
}

function drawCpuChart(data){
  const times = data.map(d=>d.time);
  const app_cpu = data.map(d=>d.app_cpu);
  const sys_cpu = data.map(d=>d.sys_cpu);
  const markPointsApp = [];
  const markPointsSys = [];
  for (let i=0;i<data.length;i++){
    if (data[i].app_cpu > 90) markPointsApp.push({ coord: [data[i].time, data[i].app_cpu], value: data[i].app_cpu, itemStyle: { color: '#ff6b6b' } });
    if (data[i].sys_cpu > 90) markPointsSys.push({ coord: [data[i].time, data[i].sys_cpu], value: data[i].sys_cpu, itemStyle: { color: '#ff6b6b' } });
  }
  const chartDom = document.getElementById('cpu-chart');
  window.cpuChart = echarts.init(chartDom);
  const option = {
    title: { text: 'Sys/App CPU使用率分析', left: 'center', textStyle: { fontSize: 18, fontWeight: 'bold', color: '#2c3e50' }, subtext: data.length + ' 个采样点', subtextStyle: { color: '#7f8c8d' } },
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(255,255,255,0.95)', borderColor: '#ddd', borderWidth: 1, textStyle: { color: '#333' }, formatter: function(params){ let r = '<div style="font-weight:bold; margin-bottom:8px;">' + params[0].axisValue + '</div>'; params.forEach(function(item){ let warning = item.value > 90 ? '<span style="color:#ff6b6b; font-weight:bold;"> (高CPU警告!)</span>' : ''; r += '<div>' + item.marker + ' ' + item.seriesName + ': <span style="font-weight:bold">' + item.value + '%</span>' + warning + '</div>'; }); return r; } },
    legend: { data: ['App CPU','Sys CPU'], bottom: 10 },
    grid: { left: '3%', right: '4%', bottom: '15%', top: '15%', containLabel: true },
    toolbox: { feature: { saveAsImage: { title: '保存为图片', pixelRatio: 2 }, dataZoom: { title: { zoom: '区域缩放', back: '缩放还原' } } } },
    dataZoom: [ { type: 'inside', start: 0, end: 100, throttle: 50 }, { type: 'slider', start: 0, end: 100, bottom: 40, throttle: 50 } ],
    xAxis: { type: 'category', data: times, axisLabel: { interval: 'auto', rotate: 30, fontSize: 11 }, name: '时间', nameLocation: 'middle', nameGap: 30, axisLine: { lineStyle: { color: '#ccc' } } },
    yAxis: { type: 'value', name: 'CPU使用率 (%)', min: 0, max: function(value){ return Math.ceil(value.max * 1.2); }, axisLabel: { formatter: '{value}%' }, axisLine: { lineStyle: { color: '#ccc' } }, splitLine: { lineStyle: { type: 'dashed', color: '#eee' } } },
    series: [
      { name: 'App CPU', type: 'line', data: app_cpu, smooth: true, symbol: 'circle', symbolSize: 6, lineStyle: { width: 3, color: '#5470c6' }, itemStyle: { color: '#5470c6' }, markPoint: { data: markPointsApp, symbolSize: 20, itemStyle: { color: '#ff6b6b' }, label: { formatter: '{c}%', color: '#fff' } }, emphasis: { itemStyle: { color: '#5470c6', borderWidth: 2 } } },
      { name: 'Sys CPU', type: 'line', data: sys_cpu, smooth: true, symbol: 'circle', symbolSize: 6, lineStyle: { width: 3, color: '#91cc75' }, itemStyle: { color: '#91cc75' }, markPoint: { data: markPointsSys, symbolSize: 20, itemStyle: { color: '#ff6b6b' }, label: { formatter: '{c}%', color: '#fff' } }, emphasis: { itemStyle: { color: '#91cc75', borderWidth: 2 } } }
    ]
  };
  window.cpuChart.setOption(option);
}

function drawMemoryChart(data){
  const times = data.map(d=>d.time);
  const tmData = data.map(d=>d.tm);
  const fmData = data.map(d=>d.fm);
  const procData = data.map(d=>d.proc);
  const chartDom = document.getElementById('memory-chart');
  window.memoryChart = echarts.init(chartDom);
  const option = {
    title: { text: '内存使用情况分析', left: 'center', textStyle: { fontSize: 18, fontWeight: 'bold', color: '#2c3e50' }, subtext: data.length + ' 个采样点', subtextStyle: { color: '#7f8c8d' } },
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(255,255,255,0.95)', borderColor: '#ddd', borderWidth: 1, textStyle: { color: '#333' }, formatter: function(params){ let r = '<div style="font-weight:bold; margin-bottom:8px;">' + params[0].axisValue + '</div>'; params.forEach(function(item){ r += '<div>' + item.marker + ' ' + item.seriesName + ': <span style="font-weight:bold">' + item.value + ' MB</span></div>'; }); return r; } },
    legend: { data: ['总内存 (TM)','空闲内存 (FM)','程序使用内存 (Proc)'], bottom: 10 },
    grid: { left: '3%', right: '4%', bottom: '15%', top: '15%', containLabel: true },
    toolbox: { feature: { saveAsImage: { title: '保存为图片', pixelRatio: 2 }, dataZoom: { title: { zoom: '区域缩放', back: '缩放还原' } } } },
    dataZoom: [ { type: 'inside', start: 0, end: 100, throttle: 50 }, { type: 'slider', start: 0, end: 100, bottom: 40, throttle: 50 } ],
    xAxis: { type: 'category', data: times, axisLabel: { interval: 'auto', rotate: 30, fontSize: 11 }, name: '时间', nameLocation: 'middle', nameGap: 30, axisLine: { lineStyle: { color: '#ccc' } } },
    yAxis: { type: 'value', name: '内存使用量 (MB)', axisLabel: { formatter: '{value} MB' }, axisLine: { lineStyle: { color: '#ccc' } }, splitLine: { lineStyle: { type: 'dashed', color: '#eee' } } },
    series: [
      { name: '总内存 (TM)', type: 'line', data: tmData, smooth: true, symbol: 'circle', symbolSize: 6, lineStyle: { width: 3, color: '#9b59b6' }, itemStyle: { color: '#9b59b6' }, emphasis: { itemStyle: { color: '#9b59b6', borderWidth: 2 } } },
      { name: '空闲内存 (FM)', type: 'line', data: fmData, smooth: true, symbol: 'circle', symbolSize: 6, lineStyle: { width: 3, color: '#3498db' }, itemStyle: { color: '#3498db' }, emphasis: { itemStyle: { color: '#3498db', borderWidth: 2 } } },
      { name: '程序使用内存 (Proc)', type: 'line', data: procData, smooth: true, symbol: 'circle', symbolSize: 6, lineStyle: { width: 3, color: '#e74c3c' }, itemStyle: { color: '#e74c3c' }, emphasis: { itemStyle: { color: '#e74c3c', borderWidth: 2 } } }
    ]
  };
  window.memoryChart.setOption(option);
}

export function parseAndDrawPerformance(logString){
  const { cpuResults, memoryResults } = parsePerformance(logString);
  const cpuBox = document.getElementById('cpu-chart-box');
  const memBox = document.getElementById('memory-chart-box');
  if (cpuResults.length) { drawCpuChart(cpuResults); cpuBox.style.display = 'block'; } else { cpuBox.style.display = 'none'; }
  if (memoryResults.length) { drawMemoryChart(memoryResults); memBox.style.display = 'block'; } else { memBox.style.display = 'none'; }
  return { cpuResults, memoryResults };
}