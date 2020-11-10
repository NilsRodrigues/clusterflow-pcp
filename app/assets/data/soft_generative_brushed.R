rm(list=ls())
setwd(getSrcDirectory(function() {}))
options("max.print"=20)

library("V8")


######################
#      settings      #
######################

exportDir <- "../../../../paper/graphics/soft_generated/" #"./"
exportPDF <- F
exportSVG <- F
exportCSV <- F
dotSize <- 0.3

plotClusters <- T
plotLabels <- F


set.seed(42)
n = 5000


allData = data.frame(stringsAsFactors=FALSE, row.names=1:n)


######################
#      functions     #
######################
newPlot <- function (xlab, ylab) {
  par(mar=c(4,4,0.2,0.2))
  plot(x=numeric(), y=numeric(), xlim=c(0,1), ylim=c(0,1), xlab=xlab, ylab=ylab)
  title(outer=TRUE)
}
renderPlot <- function(plotFunction, plotName) {
  plotFunction()
  size <- dotSize*12
  if(exportPDF) {
    pdf(paste(exportDir, plotName, ".pdf", sep=""), width=size, height=size, useDingbats=FALSE)
    plotFunction()
    dev.off()
  }
  if(exportSVG) {
    svg(paste(exportDir, plotName, ".svg", sep=""), width=size, height=size)
    plotFunction()
    dev.off()
  }
}
genericRender <- function(data, clusters) {
  xLab <- colnames(data)[1]
  yLab <- colnames(data)[2]
  newPlot(xlab=xLab, ylab=yLab)


  # has noise?
  noiseIndex <- match("NOISE", lapply(clusters, function(l) { return(l$category[1])}))
  hasNoise <- !is.na(noiseIndex)

  # move noise to the end
  if (hasNoise && noiseIndex != length(clusters)) {
    if (noiseindex == 1)
      clusters <- c(clusters[2:length(clusters)], clusters[noiseIndex])
    else
      clusters <- c(clusters[1:noiseIndex-1], clusters[noiseIndex+1:length(clusters)], clusters[noiseIndex])
  }

  if (hasNoise)
    colorsToUse <- colorScale(length(clusters)-1)
  else
    colorsToUse <- colorScale(length(clusters))

  for(i in 1:length(clusters)) {
    cluster <- clusters[[i]]

    x <- data[[1]][cluster$index]
    y <- data[[2]][cluster$index]
    if (cluster$category[1] == "NOISE")
      col <- colorNoiseCluster
    else
      col <- colorsToUse[i]
    points(x=x, y=y, pch=16, cex=dotSize, col=col)
  }
}

clusterScatterPlot <- function(data) {
  colorCluster1 <- "#33a02c"
  colorCluster2 <- "#b2df8a"
  colorScale <- colorRampPalette(c("blue", "red"))
  colorNoiseCluster <- "green"

  columnNames <- colnames(data)
  xLab <- tail(columnNames, 1)
  yLab <- columnNames[1]
  newPlot(xlab=xLab, ylab=yLab)

  clusterColumns <- columnNames[columnNames != xLab & columnNames != yLab]

  # has noise?
  noiseIndex <- grep("!noise!", clusterColumns, fixed=TRUE)[1]
  hasNoise <- !is.na(noiseIndex)

  # move noise to the end
  if (hasNoise && noiseIndex != length(clusterColumns)) {
    clusterColumns <- c(
      head(clusterColumns, noiseIndex-1),
      tail(clusterColumns, length(clusterColumns)-noiseIndex),
      clusterColumns[noiseIndex])
    noiseIndex <- length(clusterColumns)
  }

  if (hasNoise)
    colorsToUse <- colorScale(length(clusterColumns)-1)
  else
    colorsToUse <- colorScale(length(clusterColumns))

  for(i in 1:length(clusterColumns)) {
    column <- clusterColumns[i]

    labels <- data[[column]]
    x <- data[[xLab]][!is.na(labels)]
    y <- data[[yLab]][!is.na(labels)]

    if (hasNoise && i == noiseIndex)
      col <- colorNoiseCluster
    else
      col <- colorsToUse[i]
    points(x=x, y=y, pch=16, cex=dotSize, col=col)
  }
}

labelScatterPlot <- function(data) {
  colorCluster1 <- "#22AAFF"
  colorCluster2 <- "#FF0044"
  colorScale <- colorRampPalette(c("black", "black", "black", "black", colorCluster1, colorCluster1, colorCluster1, colorCluster1, colorCluster2, colorCluster2, colorCluster2, colorCluster2))
  colorsToUse <- colorScale(3)
  colorNoiseCluster <- "green"

  columnNames <- colnames(data)
  xLab <- tail(columnNames, 1)
  yLab <- columnNames[1]
  newPlot(xlab=xLab, ylab=yLab)

  clusterColumns <- columnNames[columnNames != xLab & columnNames != yLab]

  # has noise?
  noiseIndex <- grep("!noise!", clusterColumns, fixed=TRUE)[1]
  hasNoise <- !is.na(noiseIndex)

  # move noise to the end
  if (hasNoise && noiseIndex != length(clusterColumns)) {
    clusterColumns <- c(
      head(clusterColumns, noiseIndex-1),
      tail(clusterColumns, length(clusterColumns)-noiseIndex),
      clusterColumns[noiseIndex])
    noiseIndex <- length(clusterColumns)
  }

  for(i in 1:length(clusterColumns)) {
    column <- clusterColumns[i]

    labels <- data[[column]]
    x <- data[[xLab]][!is.na(labels)]
    y <- data[[yLab]][!is.na(labels)]
    labels <- labels[!is.na(labels)]
    colorIndices <- sapply(labels, function(l) {return(ceiling(l * length(colorsToUse)))})

    # render the points
    # render each color index separately
    for (colIndex in sort(unique(colorIndices))) {
      pointIndices <- colorIndices == colIndex
      #data$pointIndices <- pointIndices
      # regular points => regular size
      if (colIndex == 1)
        points(x=x[pointIndices], y=y[pointIndices], pch=16, cex=dotSize, col=colorsToUse[colorIndices[pointIndices]])
      # highlighted points => larger size
      else
        points(x=x[pointIndices], y=y[pointIndices], pch=16, cex=dotSize*5, col=colorsToUse[colorIndices[pointIndices]])
    }
  }
}

internalPlotLabels <- FALSE
commonScatterPlot <- function(data) {
  if (internalPlotLabels && plotLabels)
    labelScatterPlot(data)
  else if (!internalPlotLabels && plotClusters)
    clusterScatterPlot(data)
}

clusterAlgo <- v8()
clusterAlgo$source("r-fuzzy-dbscan.js")
clusterAlgo$source("r-clusterAlgo.js")
cluster <- function(dim1, dim2, epsMin, epsMax=NA, ptsMin, ptsMax=NA) {
  if (is.na(epsMax))
    epsMax <- epsMin
  if (is.na(ptsMax))
    ptsMax <- ptsMin
  res <- clusterAlgo$call("cluster", allData, dim1, dim2, epsMin, epsMax, ptsMin, ptsMax)
  return(res)
}

parseClusters <- function(clusterAlgoResult, title, position=0) {
  oldColNames <- colnames(allData)
  newColNames <- character(length(clusterAlgoResult))

  for(colCount in 1:length(clusterAlgoResult)) {
    cluster <- clusterAlgoResult[[colCount]]

    if (cluster$category[1] == "NOISE")
      colName <- paste("!clusters!", "noise", "!", title, sep="")
    else
      colName <- paste("!clusters!", colCount, "!", title, sep="")
    newColNames[colCount] <- colName

    column <- numeric(n)
    column[cluster$index + 1] <- cluster$label
    column[column == 0] <- NA

    allData[colName] <- column
  }

  if (position > 0) {
    position <- match(position, oldColNames) # convert the name of the column to an index
    colNames <- c(head(oldColNames, position-1), newColNames, tail(oldColNames, length(oldColNames) - position + 1))
    allData <- allData[colNames]
  }

  return(allData)
}


######################
#       D1 & D2      #
######################
sd12 <- 0.25
separation <- 0.1

d12a_length <- ceiling(n/2)
d12b_length <- n - d12a_length

# generate way more numbers than we need
d1a <- rnorm(n=d12a_length * 2.5, mean=0.3, sd=sd12)
# limit to range between 0..1
d1a <- d1a[d1a >=0 & d1a <= 1]

# generate values for other axis
d2a <- rnorm(n=d12a_length * 2.5, mean=0.7, sd=sd12)
# limit range (0..1)
d2a <- d2a[d2a >= 0 & d2a <= 1]

# ensure both axes have the same number of values (corresponds to same 2D points)
d1a <- head(d1a, length(d2a))
d2a <- head(d2a, length(d1a))

# limit points to be above the diagonal
inCluster <- d2a >= (d1a+separation)
d1a <- d1a[inCluster]
d2a <- d2a[inCluster]

# limit to number of points we actually want to have
d1a <- head(d1a, d12a_length)
d2a <- head(d2a, d12a_length)



# same procedure for cluster below diagonal
d1b <- rnorm(n=d12b_length * 2.5, mean=0.7, sd=sd12)
d1b <- d1b[d1b >=0 & d1b <= 1]

d2b <- rnorm(n=d12b_length * 2.5, mean=0.3, sd=sd12)
d2b <- d2b[d2b >=0 & d2b <= 1]

d1b <- head(d1b, length(d2b))
d2b <- head(d2b, length(d1b))

inCluster <- d2b <= (d1b-separation)
d1b <- d1b[inCluster]
d2b <- d2b[inCluster]

d1b <- head(d1b, d12b_length)
d2b <- head(d2b, d12b_length)


d1 <- c(d1a, d1b)
d2 <- c(d2a, d2b)

allData$D1 <- d1
allData$D2 <- d2

clusters <- cluster(dim1="D1", dim2="D2", epsMin=0.08, ptsMin=3)
allData <- parseClusters(clusters, "12", "D2")

plotD12 <- function() {
  dataToPlot <- allData[which(colnames(allData)=="D1")[1]:which(colnames(allData)=="D2")]
  commonScatterPlot(dataToPlot)
}
renderPlot(plotD12, "D12")
#stop()


######################
#         D3         #
######################
sd3 <- 0.07
d3a_length <- ceiling(0.5 * n)
d3b_length <- ceiling(0.3 * n)
d3c_length <- n - d3a_length - d3b_length


# generate way more numbers than we need
d3a <- rnorm(n=d3a_length * 2, mean=0.65, sd=sd3)
# limit to range between 0..1
d3a <- d3a[d3a >=0 & d3a <= 1]
d3a <- head(d3a, d3a_length)

# generate way more numbers than we need to grow the first cluster
d3b <- rnorm(n=d3b_length * 2, mean=0.8, sd=sd3)
# limit to range between 0..1
d3b <- d3b[d3b >=0 & d3b <= 1]
d3b <- head(d3b, d3b_length)

# generate values for other cluster
d3c <- rnorm(n=d3c_length * 2, mean=0.2, sd=sd3)
# limit range (0..1)
d3c <- d3c[d3c >= 0 & d3c <= 1]
d3c <- head(d3c, d3c_length)

d3 <- c(d3a,d3c,d3b)
allData$D3 <- d3

clusters <- cluster(dim1="D2", dim2="D3", epsMin=0.068, ptsMin=1)
allData <- parseClusters(clusters, "23", "D3")

plotD23 <- function() {
  dataToPlot <- allData[which(colnames(allData)=="D2")[1]:which(colnames(allData)=="D3")]
  commonScatterPlot(dataToPlot)
}
renderPlot(plotD23, "D23")
#stop()


######################
#         D4         #
######################
sd4 <- 0.07
gap <- 0.1

# generate some jitter for one cluster
d4a <- rnorm(n=n, mean=0, sd=sd4)
# make the jitter 0 at (0, 0.5, 1)
d4a <- d4a*sin(2*pi*d3) # sin(2pi∙x)
# slope at zero points is 2pi. we need it to be at most 1 at (0, 1) so the resulting numbers don't go off limit
# multiply with another sinus curve that starts at 1/2pi, goes up to 1 and back to 1/2pi
# sin(pi∙x) goes from 0 to 1 and back to 0 in our definition range [0,1]
# but we want it to start and finish at 1/2pi
# use asin(1/2pi) to find a vertical offset
# instead of multiplying x with pi, we now need to cut off asin(1/2pi) at both ends
d4a <- d4a*sin((pi-asin(1/2/pi)*2)*d3+asin(1/2/pi)) # sin[(pi-2asin(1/2pi))∙x + asin(1/2pi)]

# generate jitter for the second cluster
d4b <- rnorm(n=n, mean=0, sd=sd4)
d4b <- d4b*sin(pi*d3) # make the jitter 0 at (0, 1)
d4b <- d4b*sin((pi-asin(1/pi)*2)*d3+asin(1/pi)) # limit slope at 0 and 1 (just as before)

# add jitter to original data (so it correlates but it not on a perfect line)
d4a <- d3*(1+d4a)
d4b <- 1-(d3*(1+d4b))

# put the points from D3 in the first or second cluster
# first cluster from D3 => correlation
# second cluster from D3 => anti-correlation
# if we ever want to choose randomly between the two clusters: sample(c(0,1), size=n, replace=TRUE)
d4_fromA <- numeric(n)
d4_fromA[!is.na(allData$"!clusters!1!23")] <- 1

# let's get a preview of what is going into clusters A and B
d4a_preview <- (d4a * d4_fromA)[d4_fromA==1]
d4b_preview <- (d4b*(1 - d4_fromA))[d4_fromA==0]

# move from cluster A to cluster B, if the D4 value in cluster A is smaller than the smallest in cluster B
d4_fromA[d4a < min((d4b*(1 - d4_fromA))[d4_fromA==0])] <- 0
# update preview
d4a_preview <- (d4a * d4_fromA)[d4_fromA==1]
d4b_preview <- (d4b*(1 - d4_fromA))[d4_fromA==0]

# offset cluster B so it starts at 0
d4b <- d4b-min(d4b_preview)
d4b_preview <- (d4b*(1 - d4_fromA))[d4_fromA==0]

# stretch both clusters to the D4 center of their counterpart
d4a_center = (min(d4a_preview) + max(d4a_preview))/2
d4b_center = (min(d4b_preview) + max(d4b_preview))/2
d4a <- 1 - (1 - d4a)*((1-d4b_center)/(1-min(d4a_preview)))
d4b <- d4b * (d4a_center / max(d4b_preview))


d4 <- d4a*(d4_fromA) + d4b*(1 - d4_fromA)
allData$D4 <- d4

#allData_backup <- allData
#allData <- allData_backup
clusters <- cluster(dim1="D3", dim2="D4", epsMin=0.07, ptsMin=2)
allData <- parseClusters(clusters, "34", "D4")

plotD34 <- function() {
  #dataToPlot <- allData["D3"]
  #dataToPlot$"!clusters!1!34" <- rep(1,n)
  #dataToPlot$D4 <- allData$D4

  dataToPlot <- allData[which(colnames(allData)=="D3")[1]:which(colnames(allData)=="D4")]
  commonScatterPlot(dataToPlot)

}
renderPlot(plotD34, "D34")


######################
#      Brushing      #
######################

# find dimensions that have clustering data
clusterDims <- colnames(allData)[nchar(colnames(allData))>2]

# set all weights to a lower value so the pints move to a lower layer when rendering
allData[, clusterDims] <- allData[, clusterDims]*0.15

# find points that go through clusters 2_12, 1_23 and 1_34
selection <-
  !is.na(allData$`!clusters!2!12`) &
  !is.na(allData$`!clusters!1!23`)
# select only a single line
highlight <- match(TRUE, selection)
# apply highlight through label weight
allData[highlight, clusterDims] <- allData[highlight, clusterDims] + 0.35

# find points that go through clusters 2_12, 1_23 and 2_34
selection <-
  !is.na(allData$`!clusters!1!23`) &
  !is.na(allData$`!clusters!2!34`)
# select only a single line
highlight <- match(TRUE, selection)
# apply highlight through label weight
allData[highlight, clusterDims] <- allData[highlight, clusterDims] + 0.85


internalPlotLabels <- TRUE
renderPlot(plotD12, "D12")
renderPlot(plotD23, "D23")
renderPlot(plotD34, "D34")



######################
#     Data export    #
######################

if (exportCSV) {
  # get the name of this script
  currentFileName <- tools::file_path_sans_ext(getSrcFilename(function () {}))
  write.csv(allData, file=paste(currentFileName, ".csv", sep=""), row.names=FALSE, na="")
}
