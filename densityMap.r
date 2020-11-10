rm(list=ls())

maxDensity <- 500

minAlpha <- 0.1
maxAlpha <- 1
floorDensity <- 0
ceilDensity <- 1

epsilon <- 1 / 255;
alphaSlope <- -log((maxAlpha - minAlpha - epsilon) / epsilon) / (floorDensity - (floorDensity + ceilDensity) / 2.0)

e <- 2.7182818284
curveColors <- c("#e41a1c", "#377eb8", "#4daf4a", "#984ea3", "#ff7f00", "#a65628", "#f781bf", "#999999", "#ffff33")
currentColor <- 0
mycurve <- function(expr, main) {
  currentColor <<- (currentColor %% length(curveColors)) + 1
  curve(expr, add=T, from=0, to=1, ylim=c(0,1), xname="density", xlab="density", ylab="alpha", main=main, col=curveColors[currentColor])
}


linear <- function(density) {
  density <- density*maxDensity
  density <- density/maxDensity
  alpha <- minAlpha + (1.0-minAlpha) * density
  return(alpha)
}
mycurve(linear, "Linear")

logarithmic <- function(density) {
  density <- density*maxDensity
  density <- log(density+1)/log(maxDensity+1)
  alpha <- minAlpha + (1.0-minAlpha) * density
  return(alpha)
}
mycurve(logarithmic, "Logarithmic")

rootlogarithmic <- function(density) {
  density <- density*maxDensity
  density <- log(density+1)/log(maxDensity+1)
  density <- density^(1/5)
  alpha <- minAlpha + (1.0-minAlpha) * density
  return(alpha)
}
mycurve(rootlogarithmic, "Root Logarithmic")

root <- function(density) {
  density <- density*maxDensity
  density <- density^(1/8)/maxDensity^(1/8)
  alpha <- minAlpha + (1.0-minAlpha) * density
  return(alpha)
}
mycurve(root, "Root")


linlogistic <- function(density) {
  density <- density*maxDensity
  density <- density/maxDensity
  alpha <- minAlpha + (maxAlpha - minAlpha) / (1.0 + e^(- alphaSlope * (density - (floorDensity + ceilDensity)/2)))
  return(alpha)
}
mycurve(linlogistic, "Linear Logistic")

loglogistic <- function(density) {
  density <- density*maxDensity
  density <- log(density+1)/log(maxDensity+1)
  alpha <- minAlpha + (maxAlpha - minAlpha) / (1.0 + e^(- alphaSlope * (density - (floorDensity + ceilDensity)/2)))
  return(alpha)
}
mycurve(loglogistic, "Logarithmic Logistic")


legend("bottomright",
       fill = curveColors[1:currentColor],
       legend = c("Linear", "Logarithmic", "Root Logarithmic", "Root", "LinLogistic", "LogLogistic"))

#curve(minAlpha + (maxAlpha - minAlpha) / (1.0 + e^(- alphaSlope * ((density*maxDensity)/maxDensity - (floorDensity + ceilDensity)/2))), from=0, to=1, xname="density", xlab="density", ylab="alpha", main="LinLogistic")
#curve(log(density*maxDensity+1)/log(maxDensity+1), from=0, to=1, xname="density", xlab="density", ylab="alpha", main="LogLogistic")
