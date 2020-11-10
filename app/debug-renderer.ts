import _ = require("lodash");
import utils = require("./utils");

export const ContainerId = "debug-output";

export function clear() {
    const container = document.getElementById(ContainerId);
    utils.DOMHelper.clearRemove(container);
}

export function drawRGBAFloatArrayImage(floatArray: Float32Array, width: number, height: number, title: string = undefined): void {
    const container = document.getElementById(ContainerId);

    // set up title
    if (!_.isEmpty(title)) {
        const titleItem = document.createElement("li");
        titleItem.textContent = title;
        container.appendChild(titleItem);
    }

    // set up canvas
    const canvasItem = document.createElement("li");
    container.appendChild(canvasItem);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    //canvas.style.border = "1px solid #0F0";
    canvasItem.appendChild(canvas);

    // get max value from array
    const colorArray = floatArray.filter((value, index) => index % 4 !== 3);
    const max = Math.max(1, _.max(colorArray));
    console.log(`debug renderer: max = ${max}`);

    // render pixel by pixel
    const ctx = canvas.getContext("2d");
    let position = 0;
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            const r = Math.ceil(colorArray[position] / max * 255);
            const g = Math.ceil(colorArray[position + 1] / max * 255);
            const b = Math.ceil(colorArray[position + 2] / max * 255);
            const a = 1;//floatArray[position + 3] / max;

            ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
            ctx.fillRect(x, y, 1, 1)

            position += 3;
        }
}

export function drawRGBAFloatArrayImageLog(floatArray: Float32Array, width: number, height: number, title: string = undefined): void {
    const container = document.getElementById(ContainerId);

    // set up title
    if (!_.isEmpty(title)) {
        const titleItem = document.createElement("li");
        titleItem.textContent = title;
        container.appendChild(titleItem);
    }

    // set up canvas
    const canvasItem = document.createElement("li");
    container.appendChild(canvasItem);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    //canvas.style.border = "1px solid #0F0";
    canvasItem.appendChild(canvas);

    // get max value from array
    const colorArray = floatArray.filter((value, index) => index % 4 !== 3);
    const max = Math.max(1, _.max(colorArray));
    const maxLog = Math.log1p(max);
    console.log(`debug renderer: max = ${max}`);

    // render pixel by pixel
    const ctx = canvas.getContext("2d");
    let position = 0;
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            const r = Math.ceil(Math.log1p(colorArray[position]) / maxLog * 255);
            const g = Math.ceil(Math.log1p(colorArray[position + 1]) / maxLog * 255);
            const b = Math.ceil(Math.log1p(colorArray[position + 2]) / maxLog * 255);
            const a = 1;//floatArray[position + 3] / max;

            ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
            ctx.fillRect(x, y, 1, 1)

            position += 3;
        }
}