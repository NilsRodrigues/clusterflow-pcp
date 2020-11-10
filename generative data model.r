#clean up
rm(list=ls())
#setwd("T:/Documents/Büro/Paper/Fuzzy Clustering with Parallel Coordinates/vis-pc-clusters")

###############################################################
#             prepapration (functions and stuff)              #
###############################################################

#generate data
pointsOnLine = function(length) {
  points = matrix(data = NA, nrow = 3, ncol = length)
  offsets = rnorm(n=length, mean=0.5, sd = 0.16);
  center <<- c(-0.5, 0.5)

  for (i in 1:length) {
    #current[1] = current[1] - 1
    #current[2] = current[2] + 1
    points[1,i] = -offsets[i];
    points[2,i] = offsets[i];
    points[3,i] = 1;
  }

  return(points)
}

# change data
rotation = function(rad) {
  return(matrix(
    data = c(
      cos(rad), -sin(rad), 0,
      sin(rad),  cos(rad), 0,
             0,         0, 1),
    nrow=3,
    ncol=3,
    byrow= TRUE
  ))
}
translation = function(offset) {
  return(matrix(
    data = c(
      1, 0, offset[1],
      0, 1, offset[2],
      0, 0, 1),
    nrow=3,
    ncol=3,
    byrow= TRUE
  ))
}

# metrics on data
minRenderRangeX = NA
maxRenderRangeX = NA
minRenderRangeY = NA
maxRenderRangeY = NA
updateRenderRange = function() {
  blueRadiusX = max(abs(min(blue[1,]) - blueCenter[1]), abs(max(blue[1,]) - blueCenter[1]))
  blueRadiusY = max(abs(min(blue[2,]) - blueCenter[2]), abs(max(blue[2,]) - blueCenter[2]))
  blueRadius = sqrt(blueRadiusX * blueRadiusX + blueRadiusY * blueRadiusY)
  minBlueRange = blueCenter - blueRadius
  maxBlueRange = blueCenter + blueRadius

  redRadiusX = max(abs(min(red[1,]) - redCenter[1]), abs(max(red[1,]) - redCenter[1]))
  redRadiusY = max(abs(min(red[2,]) - redCenter[2]), abs(max(red[2,]) - redCenter[2]))
  redRadius = sqrt(redRadiusX * redRadiusX + redRadiusY * redRadiusY)
  minRedRange = redCenter - redRadius
  maxRedRange = redCenter + redRadius

  minRenderRangeX <<- min(minBlueRange[1], minRedRange[1])
  maxRenderRangeX <<- max(maxBlueRange[1], maxRedRange[1])
  minRenderRangeY <<- min(minBlueRange[2], minRedRange[2])
  maxRenderRangeY <<- max(maxBlueRange[2], maxRedRange[2])
}

# where all the data will be merged into
mergeCounter = 0;
merged = NA
merge = function(invert = FALSE) {
  mergeCounter <<- mergeCounter + 1
  plotCounter <<- 0

  tmpBlue = matrix(nrow=2, ncol=length(blue[1,]))
  tmpBlue[1,] = if(invert) 2 else 1;
  tmpBlue[2,] = blue[1,];

  tmpRed = matrix(nrow=2, ncol=length(red[1,]))
  tmpRed[1,] = if(invert) 1 else 2;
  tmpRed[2,] = red[1,];

  tmp = cbind(tmpBlue, tmpRed)
  rownames(tmp) <- c(
    gettextf("!clusters!%d", mergeCounter),
    gettextf("Sensor%i",mergeCounter)
  );

  # remove the first cluster row (for later visualization)
  if (mergeCounter == 1) {
    tmp = tmp[-1,];
    merged <<- matrix(nrow=0, ncol=length(tmp))
  }

  merged <<- rbind(merged, tmp)

  if (mergeCounter == 1) {
    rownames(merged) <<- c(gettextf("Sensor%i",mergeCounter));
  }
}

# render scatterplots of the data
renderPoints = function(points, color) {
  points(points[1,], points[2,], col=color, pch=16, cex=0.5)
}
plotCounter = 0;
renderToPdf = TRUE;
blueColor  = rgb(0  , 0, 1  , alpha=0.4)
redColor   = rgb(1  , 0, 0  , alpha=0.4)
greenColor = rgb(0.5, 1, 0.5, alpha=0.7)
showPoints = function (invert = FALSE) {
  plotCounter <<- plotCounter + 1

  # open the output file
  if (renderToPdf)
    pdf(
      file=gettextf("./paper/graphics/generated/scatter_%d_%d.pdf", mergeCounter, plotCounter),
      width=(maxRenderRangeX - minRenderRangeX) * 3,
      height=(maxRenderRangeY - minRenderRangeY) * 3) # +1 to have space for the title

  # create and set up the plot
  plot.new()
  if (!renderToPdf)
    title(gettextf("Merge %d - Plot %d", mergeCounter, plotCounter))
  plot.window(
    xlim=c(
      minRenderRangeX, #min(c(blue[1,], red[1,])),#-30,#
      maxRenderRangeX #max(c(blue[1,], red[1,]))#180#
    ),
    ylim=c(
      minRenderRangeY, #min(c(blue[2,], red[2,])),#0,#
      maxRenderRangeY #max(c(blue[2,], red[2,]))#100#
    ))
  box()
  if (!renderToPdf) {
    axis(side=1)
    axis(side=2)
  }

  # render actual data
  renderPoints(blue , if (invert)  redColor else blueColor)
  renderPoints(red  , if (invert) blueColor else redColor )
  renderPoints(green, greenColor)

  # close output file
  if (renderToPdf)
    dev.off()
}


###############################################################
#          actual stuff happening to data points :)           #
###############################################################
pointCount = 500
center = c(0, 0)
blue = pointsOnLine(pointCount)
blueCenter = center
#blueCenter = c(-pointCount/2, pointCount/2)

redCenter = NA
red = pointsOnLine(pointCount)
redCenter = center
red[1,] = red[1,] + blueCenter[1]
redCenter[1] = redCenter[1] + blueCenter[1]

green = matrix(NA, nrow=3)

merge()
updateRenderRange()
showPoints()

# rotate until they overlap
rotationStep = pi/8;

blueMtx = translation(-blueCenter)
blueMtx = rotation(rotationStep) %*% blueMtx
blueMtx = translation(blueCenter) %*% blueMtx

redMtx = translation(-redCenter)
redMtx = rotation(rotationStep) %*% redMtx
redMtx = translation(redCenter) %*% redMtx


for (i in 1:2) {
  blue = blueMtx %*% blue
  red = redMtx %*%  red
}
merge()
showPoints()

# move the overlapping points from red to blue
chance = rep(c(TRUE, FALSE), pointCount / 2)
jumpers = red[1,] >= min(blue[1,]) & red[1,] <= max(blue[1,]) & chance
green = red[, jumpers]
showPoints()

blue = cbind(blue, green)
red = red[, !jumpers]
green = matrix(nrow = 3, ncol = 0)
merge()
showPoints()

# continue rotating for a bit
for (i in 1:2) {
  blue = blueMtx %*% blue
  red = redMtx %*% red
}
merge()
showPoints()

# add constant offset (perfect correlation) and switch the cluster assignments
blue[1,] = blue[1,] + (maxRenderRangeX - minRenderRangeX) * 0.1# blueCenter[1]
red[1,] = red[1,] + (maxRenderRangeX - minRenderRangeX) * 0.1# blueCenter[1]
merge(invert = TRUE)
showPoints(invert = TRUE)

# mirror (perfect anti-correlation)
globalCenter = min(c(blue[1,], red[1,])) + max(c(blue[1,], red[1,]));
blue[1,] = globalCenter - blue[1,]
red[1,] = globalCenter - red[1,]
merge(invert = TRUE)
showPoints(invert = TRUE)

# mirror (perfect anti-correlation)
globalCenter = min(c(blue[1,], red[1,])) + max(c(blue[1,], red[1,]));
blue[1,] = globalCenter - blue[1,]
red[1,] = globalCenter - red[1,]
merge()
showPoints()

# transpose merged data => steps become dimensions for later processing
merged = t(merged)
write.csv(merged, file="./code/app/assets/data/generative.csv", row.names=FALSE, quote=FALSE)

