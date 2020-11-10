import SVG = require("svg.js");

/*
 * MouseEnter
 */
declare module "svg.js" {
    export interface Element {
        mouseenter(cb: Function): this;
    }
}
SVG.Element.prototype.mouseenter = function (f) {
    // bind event to element rather than element node
    SVG.on(this.node, "mouseenter", f);
    return this;
};



/*
 * Remember / Forget
 */

declare module "svg.js" {
    export type AnyConstructor<T> = { new(...args: any[]): T; }

    export interface Element {
        rememberType<T>(dataType: AnyConstructor<T>): T;
        rememberType<T>(dataType: AnyConstructor<T>, value: any): this;
        forgetType(...keys: Function[]): this;
    }
}

type AnyConstructor<T> = { new(...args: any[]): T; }
SVG.Element.prototype.rememberType = function<T>(dataType: AnyConstructor<T>, value: any): any {
    // use a function (= class) as key
    return this.remember(dataType.name);
};
SVG.extend(SVG.Element, {
    // Remember arbitrary data
    rememberType: SVG.Element.prototype.rememberType
});

SVG.Element.prototype.forgetType = function (dataType: Function): any {
    // use a function (= class) as key
    return this.forget(dataType.name);
};
SVG.extend(SVG.Element, {
    // Erase a given memory
    forget: SVG.Element.prototype.forgetType
});


/*
 * Title
 */

declare module "svg.js" {
    export interface Title extends SVG.Bare { }
    export interface Parent {
        title(text: string): SVG.Bare;
    }
    export interface Library { Title: Title }
}

SVG["Title"] = SVG.invent({
    create: 'title',
    inherit: SVG.Element,
    extend: {
        text: function (text) {
            while (this.node.firstChild)
                this.node.removeChild(this.node.firstChild);
            this.node.appendChild(document.createTextNode(text));
            return this;
        }
    },
    construct: {
        title: function (text) {
            return this.put(new SVG["Title"]).text(text);
        }
    },
    parent: SVG.Parent
});


/*
 * Export
 */
declare module "svg.js" {
    export interface Element {
        svg(): string;
    }
}

/*
 * Clone
 */
declare module "svg.js" {
    export interface Element {
        clone(parent?: Element): Element;
    }
    export interface Doc {
        clone(parent?: HTMLElement): Doc;
    }
}

/*
 * Extra Constants
 */
enum TextAnchors {
    Start = "start",
    Middle = "middle",
    End = "end"
}
declare module "svg.js" {
    export enum TextAnchors {
        Start = "start",
        Middle = "middle",
        End = "end"
    }
}
SVG["TextAnchors"] = TextAnchors;

declare module "svg.js" {
    export type DominantBaseline = "auto" | "use-script" | "no-change" | "reset-size" | "ideographic" | "alphabetic" | "hanging" | "mathematical" | "central" | "middle" | "text-after-edge" | "text-before-edge" | "inherit";
    export interface attrs {
        'fill-opacity': number;
        'stroke-opacity': number;
        'stroke-width': number;
        'stroke-linejoin': string;
        'stroke-linecap': string;
        'stroke-dasharray': string;
        'fill': string;
        'stroke': string;
        'opacity': number;
        'x': number;
        'y': number;
        'cx': number;
        'cy': number;
        'width': number;
        'height': number;
        'r': number;
        'rx': number;
        'ry': number;
        'offset': number;
        'stop-opacity': number;
        'stop-color': string;
        'font-size': number;
        'font-family': string;
        'text-anchor': TextAnchors;
        "dominant-baseline": DominantBaseline;
    }
    export const enum Events {
        Click = "click"
        , DblClick = "dblclick"
        , MouseDown = "mousedown"
        , MouseUp = "mouseup"
        , MouseOver = "mouseover"
        , MouseOut = "mouseout"
        , MouseMove = "mousemove"
        , MouseEnter = "mouseenter"// -> not supported by IE
        //, MouseLeave = "mouseleave"// -> not supported by IE
        , TouchStart = "touchstart"
        , TouchMove = "touchmove"
        , TouchLeave = "touchleave"
        , TouchEnd = "touchend"
        , TouchCancel = "touchcancel"
    }
}


export = SVG;