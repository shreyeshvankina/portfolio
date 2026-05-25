import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import scrollama from 'https://cdn.jsdelivr.net/npm/scrollama@3.2.0/+esm';

let xScale, yScale, timeScale;
let commitProgress = 100;
let commitMaxTime;
let data = [];
let commits = [];
let filteredCommits = [];

const techColors = d3.scaleOrdinal(d3.schemeTableau10);

async function loadData() {
  data = await d3.csv('loc.csv', (row) => ({
    ...row,
    line: Number(row.line),
    depth: Number(row.depth),
    length: Number(row.length),
    date: new Date(row.date + 'T00:00' + row.timezone),
    datetime: new Date(row.datetime),
  }));
  
  commits = processCommits(data);
  filteredCommits = [...commits];
  
  initScales();
  
  renderCommitInfo(data, commits);
  renderScatterPlot(commits);
  updateFileDisplay(commits);
  
  generateNarrativeSteps();
  initSlider();
  initScrolly();
}

function processCommits(data) {
  let processed = d3
    .groups(data, (d) => d.commit)
    .map(([commit, lines]) => {
      let first = lines[0];
      let { author, date, time, timezone, datetime } = first;

      let ret = {
        id: commit,
        url: 'https://github.com/shreyeshvankina/portfolio/commit/' + commit,
        author,
        date,
        time,
        timezone,
        datetime,
        hourFrac: datetime.getHours() + datetime.getMinutes() / 60,
        totalLines: lines.length,
      };

      Object.defineProperty(ret, 'lines', {
        value: lines,
        configurable: true,
        writable: true,
        enumerable: false, 
      });

      return ret;
    });

  return processed.sort((a, b) => a.datetime - b.datetime);
}

function initScales() {
  const width = 1000;
  const height = 600;
  const margin = { top: 10, right: 10, bottom: 30, left: 40 };

  xScale = d3
    .scaleTime()
    .domain(d3.extent(commits, (d) => d.datetime))
    .range([margin.left, width - margin.right])
    .nice();

  yScale = d3
    .scaleLinear()
    .domain([0, 24])
    .range([height - margin.bottom, margin.top]);

  timeScale = d3
    .scaleTime()
    .domain([
      d3.min(commits, (d) => d.datetime),
      d3.max(commits, (d) => d.datetime),
    ])
    .range([0, 100]);

  commitMaxTime = timeScale.invert(commitProgress);
}

function renderScatterPlot(commitsToPlot) {
  const width = 1000;
  const height = 600;
  const margin = { top: 10, right: 10, bottom: 30, left: 40 };

  d3.select('#chart').selectAll('*').remove();

  const svg = d3
    .select('#chart')
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .style('overflow', 'visible');

  // Background Grid Lines Layout
  const gridlines = svg
    .append('g')
    .attr('class', 'gridlines')
    .attr('transform', `translate(${margin.left}, 0)`);
    
  gridlines.call(
    d3.axisLeft(yScale)
      .tickFormat('')
      .tickSize(-(width - margin.left - margin.right))
  );

  const xAxis = d3.axisBottom(xScale);
  const yAxis = d3.axisLeft(yScale)
    .tickFormat((d) => String(d % 24).padStart(2, '0') + ':00');

  svg.append('g')
    .attr('transform', `translate(0, ${height - margin.bottom})`)
    .attr('class', 'x-axis')
    .call(xAxis);

  svg.append('g')
    .attr('transform', `translate(${margin.left}, 0)`)
    .attr('class', 'y-axis')
    .call(yAxis);

  svg.append('g').attr('class', 'dots');
  
  svg.call(d3.brush().on('start brush end', (event) => {
    const selection = event.selection;
    d3.selectAll('circle').classed('selected', (d) =>
      isCommitSelected(selection, d)
    );
    renderSelectionCount(selection, commitsToPlot);
    renderLanguageBreakdown(selection, commitsToPlot);
  }));

  updateScatterPlotCircles(commitsToPlot);
}

function updateScatterPlotCircles(commitsToUpdate) {
  const svg = d3.select('#chart').select('svg');
  const dots = svg.select('g.dots');

  xScale = xScale.domain(d3.extent(commitsToUpdate, (d) => d.datetime));

  const xAxisGroup = svg.select('g.x-axis');
  xAxisGroup.selectAll('*').remove();
  xAxisGroup.call(d3.axisBottom(xScale));

  const [minLines, maxLines] = d3.extent(commits, (d) => d.totalLines);
  const rScale = d3.scaleSqrt().domain([minLines || 1, maxLines || 100]).range([2, 30]);
  const sortedCommits = d3.sort(commitsToUpdate, (d) => -d.totalLines);

  dots
    .selectAll('circle')
    .data(sortedCommits, (d) => d.id)
    .join(
      (enter) => enter.append('circle')
        .attr('cx', (d) => xScale(d.datetime))
        .attr('cy', (d) => yScale(d.hourFrac))
        .attr('r', 0)
        .attr('fill', 'var(--color-accent, steelblue)')
        .style('fill-opacity', 0.7),
      (update) => update,
      (exit) => exit.transition().duration(200).attr('r', 0).remove()
    )
    .transition().duration(300)
    .attr('cx', (d) => xScale(d.datetime))
    .attr('cy', (d) => yScale(d.hourFrac))
    .attr('r', (d) => rScale(d.totalLines))
    .selection() 
    .on('mouseenter', (event, commit) => {
      d3.select(event.currentTarget).style('fill-opacity', 1);
      renderTooltipContent(commit);
      updateTooltipVisibility(true);
      updateTooltipPosition(event);
    })
    .on('mousemove', (event) => {
      updateTooltipPosition(event); 
    })
    .on('mouseleave', (event) => {
      d3.select(event.currentTarget).style('fill-opacity', 0.7);
      updateTooltipVisibility(false);
    });
}

function updateFileDisplay(commitsToProcess) {
  const lines = commitsToProcess.flatMap((d) => d.lines);
  const files = d3
    .groups(lines, (d) => d.file)
    .map(([name, fileLines]) => ({ name, lines: fileLines }))
    .sort((a, b) => b.lines.length - a.lines.length);

  const filesContainer = d3
    .select('#files')
    .selectAll('div.file-entry')
    .data(files, (d) => d.name)
    .join(
      (enter) => enter.append('div').attr('class', 'file-entry').call((div) => {
        div.append('dt').append('code');
        div.select('dt').append('small');
        div.append('dd');
      }),
      (update) => update,
      (exit) => exit.remove()
    );

  filesContainer.select('dt > code').text((d) => d.name);
  filesContainer.select('dt > small').text((d) => `${d.lines.length} lines`);

  filesContainer
    .select('dd')
    .selectAll('div.loc')
    .data((d) => d.lines, (d) => d.line + '-' + d.file)
    .join(
      (enter) => enter.append('div')
        .attr('class', 'loc')
        .style('--color', (d) => techColors(d.type)),
      (update) => update,
      (exit) => exit.remove()
    );
}

function renderCommitInfo(allData, allCommits) {
  d3.select('#stats').selectAll('*').remove();
  const dl = d3.select('#stats').append('dl').attr('class', 'stats');

  dl.append('dt').html('Total <abbr title="Lines of code">LOC</abbr>');
  dl.append('dd').text(allData.length);

  dl.append('dt').text('Total commits');
  dl.append('dd').text(allCommits.length);

  dl.append('dt').text('Number of files');
  dl.append('dd').text(d3.group(allData, (d) => d.file).size);

  dl.append('dt').text('Longest line length');
  dl.append('dd').text(d3.max(allData, (d) => d.length) + ' chars');
}

function generateNarrativeSteps() {
  d3.select('#scatter-story').selectAll('*').remove();
  
  d3.select('#scatter-story')
    .selectAll('.step')
    .data(commits)
    .join('div')
    .attr('class', 'step')
    .html((d, i) => `
      <p>On <strong>${d.datetime.toLocaleString('en', { dateStyle: 'full', timeStyle: 'short' })}</strong>, 
      I pushed <a href="${d.url}" target="_blank">${i > 0 ? 'another progressive commit' : 'the foundational core build'}</a>.</p>
      <p>This structural change adjusted <strong>${d.totalLines} lines</strong> across 
      <strong>${d3.groups(d.lines, (l) => l.file).length} unique workspace files</strong>.</p>
    `);
}

function initSlider() {
  const slider = document.getElementById('commit-progress');
  if (!slider) return;
  
  slider.addEventListener('input', onTimeSliderChange);
  onTimeSliderChange({ target: slider });
}

function onTimeSliderChange(event) {
  commitProgress = Number(event.target.value);
  commitMaxTime = timeScale.invert(commitProgress);
  
  document.getElementById('commit-time').textContent = commitMaxTime.toLocaleString('en', {
    dateStyle: 'long',
    timeStyle: 'short'
  });

  filteredCommits = commits.filter((d) => d.datetime <= commitMaxTime);
  
  updateScatterPlotCircles(filteredCommits);
  updateFileDisplay(filteredCommits);
}

function initScrolly() {
  const scroller = scrollama();

  scroller
    .setup({
      container: '#scrolly-1',
      step: '#scrolly-1 .step',
      offset: 0.5,
    })
    .onStepEnter((response) => {
      d3.selectAll('.step').classed('active', (_, i) => i === response.index);
      
      const stepCommit = response.element.__data__;
      if (stepCommit) {
        
        const historyUpToStep = commits.filter((d) => d.datetime <= stepCommit.datetime);
        updateScatterPlotCircles(historyUpToStep);
        updateFileDisplay(historyUpToStep);
        
        
        const calculatedPercentage = timeScale(stepCommit.datetime);
        const slider = document.getElementById('commit-progress');
        if (slider) {
          slider.value = calculatedPercentage;
          document.getElementById('commit-time').textContent = stepCommit.datetime.toLocaleString('en', {
            dateStyle: 'long',
            timeStyle: 'short'
          });
        }
      }
    });

  window.addEventListener('resize', scroller.resize);
}

function renderTooltipContent(commit) {
  const link = document.getElementById('commit-link');
  const date = document.getElementById('commit-date');
  const time = document.getElementById('commit-time-val');
  const author = document.getElementById('commit-author');
  const lines = document.getElementById('commit-lines');

  if (!commit || Object.keys(commit).length === 0) return;

  link.href = commit.url;
  link.textContent = commit.id.slice(0, 7);
  date.textContent = commit.datetime?.toLocaleString('en', { dateStyle: 'full' });
  time.textContent = commit.time;
  author.textContent = commit.author;
  lines.textContent = commit.totalLines;
}

function updateTooltipVisibility(isVisible) {
  const tooltip = document.getElementById('commit-tooltip');
  if (tooltip) tooltip.hidden = !isVisible;
}

function updateTooltipPosition(event) {
  const tooltip = document.getElementById('commit-tooltip');
  if (tooltip) {
    tooltip.style.left = `${event.clientX + 15}px`;
    tooltip.style.top = `${event.clientY + 15}px`;
  }
}

function isCommitSelected(selection, commit) {
  if (!selection) return false;
  const min = { x: selection[0][0], y: selection[0][1] };
  const max = { x: selection[1][0], y: selection[1][1] };
  const x = xScale(commit.datetime);
  const y = yScale(commit.hourFrac);
  return x >= min.x && x <= max.x && y >= min.y && y <= max.y;
}

function renderSelectionCount(selection, targetCommits) {
  const selectedCommits = selection ? targetCommits.filter((d) => isCommitSelected(selection, d)) : [];
  document.getElementById('selection-count').textContent = `${selectedCommits.length || 'No'} commits selected`;
}

function renderLanguageBreakdown(selection, targetCommits) {
  const selectedCommits = selection ? targetCommits.filter((d) => isCommitSelected(selection, d)) : [];
  const container = document.getElementById('language-breakdown');
  if (!container) return;

  if (selectedCommits.length === 0) {
    container.innerHTML = '';
    return;
  }
  
  const lines = selectedCommits.flatMap((d) => d.lines);
  const breakdown = d3.rollup(lines, (v) => v.length, (d) => d.type);
  container.innerHTML = '';

  for (const [language, count] of breakdown) {
    const proportion = count / lines.length;
    const formatted = d3.format('.1~%')(proportion);
    container.innerHTML += `<dt>${language}</dt><dd>${count} lines (${formatted})</dd>`;
  }
}

loadData();