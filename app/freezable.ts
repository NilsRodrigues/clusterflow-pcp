import _ = require("lodash");


export interface Freezable {
    freeze: () => void;
    unFreeze: () => void;
    isFrozen: boolean;
}
export class Freezer implements Freezable {
    constructor(public readonly onResume: () => void, public readonly parent: Freezer = undefined) {}

    private _isFrozen = false;
    public get isFrozen(): boolean {
        return this._isFrozen;
    }
    private _willResume = false;
    public get willResume(): boolean {
        return this._willResume;
    }

    public freeze = (): void => {
        this._isFrozen = true;
    }
    public unFreeze = (): void => {
        this._isFrozen = false;
        if (this._willResume) {

            // walk the hierarchy and check if any parent will resume after us
            let parentWillResume = false;
            let parent = this.parent;
            while (!parentWillResume && !_.isNil(parent)) {
                if (parent._willResume)
                    parentWillResume = true;
                else
                    parent = parent.parent;
            }

            if (!parentWillResume)
                this.onResume();

            this._willResume = false;
        }
    }

    public canResume = (): boolean => {
        if (!this._isFrozen)
            return true;

        this._willResume = true;
        return false;
    }
}