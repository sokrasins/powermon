// URL of power management server
const url = "http://192.168.41.40:5000/"
const since = "since/"

const minsPerHour = 60
const secsPerMin = 60
const millisPerSec = 1000

data = []
display_hours = 1


// set the dimensions and margins of the graph
const margin = {top: 60, right: 50, bottom: 50, left: 50},
    width = window.innerWidth- margin.left - margin.right,
    height = 500 - margin.top - margin.bottom;

// Change the diplay_hours var when the radio button state has changed
var timeSlider = document.getElementById("timeToDisplay")
var timeLabel = document.getElementById("displayTimeLabel")

timeSlider.addEventListener("change", function () {
  if (this.value !== display_hours) {
    display_hours = this.value
    console.log(this.value)
    timeLabel.textContent = this.value.toString()
    plotGraph(data, display_hours)
  }

})

function getNewData(timestamp) {
  return fetch( url+since+timestamp, {
      method: 'GET',
      mode: 'cors'
    }).then( function(resp) {
      return resp.json();
    })
}

function trimData(data, numHours) {
  const lastTime = data[data.length-1].time
  const earliestTime = lastTime - (numHours * minsPerHour * secsPerMin * millisPerSec)
  newData = data.filter(sample => sample.time > earliestTime)
  return newData
}

getNewData("0").then( function(newData) {
  data = newData
})

setInterval(() => {
  const nextDataTimestamp = (data[data.length-1].time + 1).toString()
  getNewData(nextDataTimestamp).then( function(newData) {
    data.push(...newData)
    data = trimData(data, 24)
    
    plotGraph(data, display_hours)
  })

}, 5000)

// Plots the history of power consumption.
function plotGraph(data, hours) {

  data = trimData(data, hours) 

  d3.selectAll('svg').remove()

  // append the svg object to the body of the page
  const svg = d3.select("#my_dataviz")
    .append("svg")
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
    .append("g")
      .style("font", "14px arial")
      .attr("transform",
            `translate(${margin.left}, ${margin.top})`);

  // Get the data for the last hour from the server
  // TODO: Continuous updating?
  //fetch("http://192.168.41.40:5000/last/"+time, {
  //  method: 'GET',
  //  mode: 'cors'
  //}).then(function(resp) {
  //  //power_data = resp.json();
  //  //return power_data;
  //  return resp.json();
  //}).then( function(data) {


    //////////
    // GENERAL //
    //////////
    const keys = Object.keys(data[0])
      .filter(function (item) {
        return item !== 'time'
      });

      const colorscheme = [
      '#B44D64',
      '#FB946B',
      '#FFBC72',
      '#F2D9B1',
      '#101F5C',
      '#316CA6'
    ]

    // color palette
    const color = d3.scaleOrdinal()
      .domain(keys)
      .range(colorscheme);

    //stack the data?
    const stackedData = d3.stack()
      .keys(keys)
      (data)

    // Map timestamp from ms epoch time to minutes relative to now
    const latestTime = data[data.length - 1].time
    data = data.map(x => {
      x.time = (x.time - latestTime) / 1000 / 60
      return x
    })

    //////////
    // AXIS //
    //////////

    // Add X axis
    const x = d3.scaleLinear()
      .domain(d3.extent(data, function(d) { return d.time; }))
      .range([ 0, width ]);
    const xAxis = svg.append("g")
      .attr("transform", `translate(0, ${height})`)
      .call(d3.axisBottom(x).ticks(10))

    // Add X axis label:
    svg.append("text")
        .attr("text-anchor", "end")
        .attr("x", width)
        .attr("y", height+40 )
        .text("Time (minutes)");

    // Add Y axis label:
    svg.append("text")
        .attr("text-anchor", "end")
        .attr("x", 0)
        .attr("y", -20 )
        .text("Power Consumption (Watts)")
        .attr("text-anchor", "start")

    // Add Y axis
    const y = d3.scaleLinear()
      .domain([0, 100])
      .range([ height, 0 ]);
    svg.append("g")
      .call(d3.axisLeft(y).ticks(10))



    //////////
    // HIGHLIGHT GROUP //
    //////////

    // What to do when one group is hovered
    const highlight = function(event,d){
      // reduce opacity of all groups
      d3.selectAll(".myArea").style("opacity", .1)
      // expect the one that is hovered
      d3.select("."+d).style("opacity", 1)
    }

    // And when it is not hovered anymore
    const noHighlight = function(event,d){
      d3.selectAll(".myArea").style("opacity", 1)
    }


    //////////
    // BRUSHING AND CHART //
    //////////

    // Add a clipPath: everything out of this area won't be drawn.
    const clip = svg.append("defs").append("svg:clipPath")
      .attr("id", "clip")
      .append("svg:rect")
      .attr("width", width )
      .attr("height", height )
      .attr("x", 0)
      .attr("y", 0)


    // Add brushing
    const brush = d3.brushX()                 // Add the brush feature using the d3.brush function
      .extent( [ [0,0], [width,height] ] ) // initialise the brush area: start at 0,0 and finishes at width,height: it means I select the whole graph area
      .on("end", updateChart) // Each time the brush selection changes, trigger the 'updateChart' function

    // Create the scatter variable: where both the circles and the brush take place
    const areaChart = svg.append('g')
      .attr("clip-path", "url(#clip)")

    // Area generator
    const area = d3.area()
      .x(function(d) { return x(d.data.time); })
      .y0(function(d) { return y(d[0]); })
      .y1(function(d) { return y(d[1]); })

    // Show the areas
    areaChart
      .selectAll("mylayers")
      .data(stackedData)
      .join("path")
      .attr("class", function(d) { return "myArea " + d.key })
      .style("fill", function(d) { return color(d.key); })
      .attr("d", area)

    // Add the brushing
    areaChart
      .append("g")
      .attr("class", "brush")
      .call(brush);

    let idleTimeout
    function idled() { idleTimeout = null; }

    // A function that update the chart for given boundaries
    function updateChart(event,d) {
      extent = event.selection

      // If no selection, back to initial coordinate. Otherwise, update X axis domain
      if(!extent){
        if (!idleTimeout) return idleTimeout = setTimeout(idled, 350); // This allows to wait a little bit
        x.domain(d3.extent(data, function(d) { return d.time; }))
      }else{
        x.domain([ x.invert(extent[0]), x.invert(extent[1]) ])
        areaChart.select(".brush").call(brush.move, null) // This remove the grey brush area as soon as the selection has been done
      }

      // Update axis and area position
      xAxis.transition().duration(1000).call(d3.axisBottom(x).ticks(5))
      areaChart
        .selectAll("path")
        .transition().duration(1000)
        .attr("d", area)
    }


    //////////
    // TOOL TIP //
    //////////

    var bisectTime = d3.bisector(function(d) {
            return d.time;
    }).left;

    // Tooltip elements. Each plug gets an element
    tooltipFoci = []
    keys.forEach( (key, index) => {
      tooltipFoci.push( svg.append("g")
        .attr("class", "focus")
        .style("display", "none")
      );
         
      tooltipFoci[index].append("circle")
        .attr("r", 5)
        .attr("fill", "#000000");

      tooltipFoci[index].append("text")
        .attr("x", 9)
        .attr("dy", ".35em")
        .attr("fill", "#000000")
        .attr("font-size", 14);
    })

    // tooltip with hover point and line
    function mouseMove(event) {
      var x0 = x.invert(d3.pointer(event)[0]),
          i = bisectTime(data, x0, 1),
          d0 = data[i - 1],
          d1 = data[i],
          d = x0 - d0.time > d1.time - x0 ? d1 : d0;

      const plugVals = keys.map(key => d[key]);
      const yVals = plugVals.map((sum => value => sum += value)(0));

      tooltipFoci.forEach( (focus, index) => {
        focus.attr("transform", "translate(" + x(d.time) + "," + y(yVals[index]) + ")");
        focus.select("text").text(plugVals[index]+"W");
      })
    }

    svg.append("rect")
      .attr("opacity", "0")
      .attr("width", width)
      .attr("height", height)
      .on("mouseover", function() {
        tooltipFoci.forEach( focus => focus.style("display", null) )
      })
      .on("mouseout", function() {
        tooltipFoci.forEach( focus => focus.style("display", "none") )
      })
      .on("mousemove", mouseMove);
    
    

    //////////
    // LEGEND //
    //////////

    // Add one dot in the legend for each name.
    const size = 10 
    svg.selectAll("myrect")
      .data(keys)
      .join("rect")
      .attr("x", 20)
      .attr("y", function(d,i){ return i*(size+5)}) // 100 is where the first dot appears. 25 is the distance between dots
      .attr("width", size)
      .attr("height", size)
      .style("fill", function(d){ return color(d)})
      .on("mouseover", highlight)
      .on("mouseleave", noHighlight)

    // Add one dot in the legend for each name.
    svg.selectAll("mylabels")
      .data(keys)
      .join("text")
      .attr("x", 20 + size*1.2)
      .attr("y", function(d,i){ return i*(size+5) + (size/2)}) // 100 is where the first dot appears. 25 is the distance between dots
      .style("fill", function(d){ return color(d)})
      .text(function(d){ return d})
      .attr("text-anchor", "left")
      .style("alignment-baseline", "middle")
      .on("mouseover", highlight)
      .on("mouseleave", noHighlight)

  //})

}
