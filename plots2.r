# Function for automatically installing and loading of packages, so that the code runs on every R instance.
pkgLoad <- function(x) {
  if (!require(x, character.only = TRUE)) {
    chooseCRANmirror(ind = 33)
    install.packages(x, dep = TRUE)
    if (!require(x, character.only = TRUE))
      stop("Package not found")
  }
  suppressPackageStartupMessages(library(x, character.only = TRUE))
}

# Set working directory.
pkgLoad("rstudioapi")
setwd(dirname(getActiveDocumentContext()$path))

# Packages.
#pkgLoad("dplyr")
pkgLoad("ggplot2")

# Load and format data.
data <- read.csv(file="../code/app/assets/data/generative.csv", header = TRUE, stringsAsFactors = FALSE)
data$X.clusters.2 <- factor(data$X.clusters.2)
data$X.clusters.3 <- factor(data$X.clusters.3)
data$X.clusters.4 <- factor(data$X.clusters.4)
data$X.clusters.5 <- factor(data$X.clusters.5)
data$X.clusters.6 <- factor(data$X.clusters.6)
data$X.clusters.7 <- factor(data$X.clusters.7)

# Plot
plot <- ggplot(data, aes(x = Sensor1, y = Sensor2, color = X.clusters.2)) +
  geom_point(shape = 16, alpha = 0.1) +
  scale_color_brewer(palette = "Set1") +
  theme_void() +
  theme(legend.position = "none")
ggsave("plot.png", plot)
 