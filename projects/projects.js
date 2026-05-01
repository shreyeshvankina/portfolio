import { fetchJSON, renderProjects } from '../global.js';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

const projects = await fetchJSON('../lib/projects.json');

const projectsContainer = document.querySelector('.projects');
const projectsTitle = document.querySelector('.projects-title');

if (projectsContainer && projects) {
    renderProjects(projects, projectsContainer, 'h2');
}

if (projectsTitle && projects) {
    projectsTitle.textContent = `${projects.length} Projects`;
}


let arcGenerator = d3.arc().innerRadius(0).outerRadius(50);
let colors = d3.scaleOrdinal(d3.schemeTableau10);


let selectedIndex = -1;

function renderPieChart(projectsGiven) {
    let newSVG = d3.select('#projects-pie-plot');
    newSVG.selectAll('path').remove();
    let legend = d3.select('.legend');
    legend.selectAll('li').remove();

    let newRolledData = d3.rollups(
        projectsGiven,
        (v) => v.length,
        (d) => d.year,
    );

    let newData = newRolledData.map(([year, count]) => {
        return { value: count, label: year };
    });

    let newSliceGenerator = d3.pie().value((d) => d.value);
    let newArcData = newSliceGenerator(newData);
    let newArcs = newArcData.map((d) => arcGenerator(d));

    newArcs.forEach((arc, i) => {
        // Draw the pie slices
        newSVG.append('path')
              .attr('d', arc)
              .attr('fill', colors(i))
              // Step 5.2: Handle clicks
              .on('click', () => {
                  // Toggle selected index
                  selectedIndex = selectedIndex === i ? -1 : i;

                  // Update path classes
                  newSVG.selectAll('path')
                        .attr('class', (_, idx) => (
                            idx === selectedIndex ? 'selected' : ''
                        ));

                  // Update legend classes
                  legend.selectAll('li')
                        .attr('class', (_, idx) => (
                            idx === selectedIndex ? 'selected' : ''
                        ));

                  // Step 5.3: Filter projects by selected year
                  if (selectedIndex === -1) {
                      // If nothing is selected, show all current projects
                      renderProjects(projectsGiven, projectsContainer, 'h2');
                  } else {
                      // Filter by the selected year
                      let selectedYear = newData[selectedIndex].label;
                      let filteredProjects = projectsGiven.filter(
                          (project) => project.year === selectedYear
                      );
                      renderProjects(filteredProjects, projectsContainer, 'h2');
                  }
              });

        // Draw the legend 
        legend.append('li')
              .attr('style', `--color:${colors(i)}`)
              .html(`<span class="swatch"></span> ${newData[i].label} <em>(${newData[i].value})</em>`);
    });
}

if (projects) {
    renderPieChart(projects);
}

let query = '';
let searchInput = document.querySelector('.searchBar');

searchInput.addEventListener('input', (event) => {
    query = event.target.value;

    let filteredProjects = projects.filter((project) => {
        let values = Object.values(project).join('\n').toLowerCase();
        return values.includes(query.toLowerCase());
    });

    renderProjects(filteredProjects, projectsContainer, 'h2');

    renderPieChart(filteredProjects);
});