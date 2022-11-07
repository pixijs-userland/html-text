import { Sprite } from '@pixi/sprite';
import { Texture, Rectangle, settings, utils } from '@pixi/core';
import { TextStyle } from '@pixi/text';
import type { ITextStyle } from '@pixi/text';
import type { Renderer, IRenderer } from '@pixi/core';
import type { IDestroyOptions } from '@pixi/display';

/**
 * Text display object that support multi-style HTML text.
 * @class
 * @extends PIXI.Sprite
 * @see {@link https://pixijs.download/dev/docs/PIXI.Sprite.html PIXI.Sprite}
 * @see {@link https://pixijs.download/dev/docs/PIXI.TextStyle.html PIXI.TextStyle}
 */
export class HTMLText extends Sprite
{
    private _domElement: HTMLElement;
    private _svgRoot: SVGSVGElement;
    private _foreignObject: SVGForeignObjectElement;
    private _image: HTMLImageElement;
    private canvas: HTMLCanvasElement;
    private context: CanvasRenderingContext2D;
    private _resolution: number;
    private _text: string | null = null;
    private _style: TextStyle | null = null;
    private _autoResolution = true;
    private _loading = false;
    private localStyleID = -1;
    private dirty = false;

    /**
     * @param {string} [text] - Text contents
     * @param {PIXI.TextStyle} [style] - Style settings, not all TextStyle options are supported.
     * @param {HTMLCanvasElement} [canvas] - Optional canvas to use for rendering.
     *.       if undefined, will generate it's own canvas using createElement.
     */
    constructor(text = '', style: TextStyle | Partial<ITextStyle> = {}, canvas?: HTMLCanvasElement)
    {
        canvas = canvas || document.createElement('canvas');

        canvas.width = 3;
        canvas.height = 3;

        const texture = Texture.from(canvas, { scaleMode: settings.SCALE_MODE });

        texture.orig = new Rectangle();
        texture.trim = new Rectangle();

        super(texture);

        const ns = 'http://www.w3.org/2000/svg';
        const svgRoot = document.createElementNS(ns, 'svg');
        const foreignObject = document.createElementNS(ns, 'foreignObject');
        const domElement = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');

        foreignObject.setAttribute('height', '100%');
        foreignObject.setAttribute('width', '100%');
        svgRoot.appendChild(foreignObject);

        this._domElement = domElement;
        this._svgRoot = svgRoot;
        this._foreignObject = foreignObject;
        this._image = new Image();

        this.canvas = canvas;
        this.context = canvas.getContext('2d') as CanvasRenderingContext2D;
        this._resolution = settings.RESOLUTION;
        this.text = text;
        this.style = style;
    }

    /**
     * Manually refresh the text.
     * @public
     * @param {boolean} respectDirty - Whether to abort updating the
     *        text if the Text isn't dirty and the function is called.
     */
    updateText(respectDirty = true): void
    {
        const { style, resolution } = this;

        const canvas = this.canvas as HTMLCanvasElement;
        const context = this.context as CanvasRenderingContext2D;

        // check if style has changed..
        if (this.localStyleID !== style.styleID)
        {
            this.dirty = true;
            this.localStyleID = style.styleID;
        }

        if (!this.dirty && respectDirty)
        {
            return;
        }

        let css = `
            display:inline-block;
            color:${style.fill};
            font-size: ${style.fontSize}px;
            font-family:${style.fontFamily};
            font-weight:${style.fontWeight};
            font-style:${style.fontStyle};
            font-variant:${style.fontVariant};
            letter-spacing:${style.letterSpacing}px;
            text-align:${style.align};
            padding:${style.padding}px;
        `;

        if (style.lineHeight)
        {
            css += `line-height:${style.lineHeight}px;`;
        }

        if (style.wordWrap)
        {
            css += `word-wrap:${style.breakWords ? 'break-all' : 'break-word'};`;
            css += `max-width:${style.wordWrapWidth}px;`;
        }

        if (style.strokeThickness)
        {
            let { stroke } = style;

            if (typeof stroke === 'number')
            {
                stroke = utils.hex2string(stroke);
            }

            css += `-webkit-text-stroke-width: ${style.strokeThickness}px;`;
            css += `-webkit-text-stroke-color: ${stroke};`;
            css += `text-stroke-width: ${style.strokeThickness}px;`;
            css += `text-stroke-color: ${stroke};`;
            css += 'paint-order: stroke;';
        }

        if (style.dropShadow)
        {
            const { dropShadowAngle, dropShadowDistance, dropShadowBlur, dropShadowColor, dropShadowAlpha } = style;
            const x = Math.round(Math.cos(dropShadowAngle) * dropShadowDistance);
            const y = Math.round(Math.sin(dropShadowAngle) * dropShadowDistance);
            let color = dropShadowColor;

            // Convert numbers to hex strings
            if (typeof color === 'number')
            {
                color = utils.hex2string(color);
            }

            // Check if we should apply alpha
            if (color.charAt(0) === '#' && dropShadowAlpha < 1)
            {
                const [r, g, b] = utils.hex2rgb(parseInt(color.replace('#', ''), 16));

                color = `rgba(${r * 255 | 0}, ${g * 255 | 0}, ${b * 255 | 0}, ${dropShadowAlpha})`;
            }

            css += `text-shadow: ${x}px ${y}px ${dropShadowBlur}px ${color};`;
        }

        const dom = this._domElement;

        Object.assign(dom, {
            innerHTML: this._text,
            style: css,
        });

        // Measure the contents
        document.body.appendChild(dom);
        const { width: _width, height: _height } = dom.getBoundingClientRect();
        const width = Math.ceil(_width);
        const height = Math.ceil(_height);

        document.body.removeChild(dom);

        // Assemble the svg output
        this._foreignObject.appendChild(dom);
        this._svgRoot.setAttribute('width', width.toString());
        this._svgRoot.setAttribute('height', height.toString());

        canvas.width = Math.ceil((Math.max(1, width) + (style.padding * 2)) * resolution);
        canvas.height = Math.ceil((Math.max(1, height) + (style.padding * 2)) * resolution);

        if (!this._loading)
        {
            const image = this._image;
            const svgURL = new XMLSerializer().serializeToString(this._svgRoot);

            this._loading = true;
            image.src = `data:image/svg+xml;charset=utf8,${encodeURIComponent(svgURL)}`;
            image.onload = () =>
            {
                context.scale(resolution, resolution);
                context.clearRect(0, 0, canvas.width, canvas.height);
                context.drawImage(
                    image,
                    0, 0, width, height,
                    0, 0, width, height,
                );
                image.src = '';
                image.onload = null;
                this._loading = false;
                this.updateTexture();
            };
        }
    }

    /**
     * Update the texture resource.
     * @private
     */
    updateTexture()
    {
        const { style, texture, resolution } = this;

        const canvas = this.canvas as HTMLCanvasElement;
        const context = this.context as CanvasRenderingContext2D;

        if (style.trim)
        {
            const { width, height, data } = utils.trimCanvas(canvas);

            if (data)
            {
                canvas.width = width;
                canvas.height = height;
                context.putImageData(data, 0, 0);
            }
        }

        const padding = style.trim ? 0 : style.padding;
        const baseTexture = texture.baseTexture;

        texture.trim.width = texture._frame.width = canvas.width / resolution;
        texture.trim.height = texture._frame.height = canvas.height / resolution;
        texture.trim.x = -padding;
        texture.trim.y = -padding;

        texture.orig.width = texture._frame.width - (padding * 2);
        texture.orig.height = texture._frame.height - (padding * 2);

        // call sprite onTextureUpdate to update scale if _width or _height were set
        this._onTextureUpdate();

        baseTexture.setRealSize(canvas.width, canvas.height, resolution);

        this.dirty = false;
    }

    /**
     * Renders the object using the WebGL renderer
     *
     * @param {PIXI.Renderer} renderer - The renderer
     * @private
     */
    _render(renderer: Renderer)
    {
        if (this._autoResolution && this._resolution !== renderer.resolution)
        {
            this._resolution = renderer.resolution;
            this.dirty = true;
        }

        this.updateText(true);

        super._render(renderer);
    }

    /**
     * Renders the object using the Canvas Renderer.
     *
     * @private
     * @param {PIXI.CanvasRenderer} renderer - The renderer
     */
    _renderCanvas(renderer: IRenderer)
    {
        if (this._autoResolution && this._resolution !== renderer.resolution)
        {
            this._resolution = renderer.resolution;
            this.dirty = true;
        }

        this.updateText(true);

        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        super._renderCanvas(renderer);
    }

    /**
     * Get the local bounds.
     *
     * @param {PIXI.Rectangle} rect - Input rectangle.
     * @return {PIXI.Rectangle} Local bounds
     */
    getLocalBounds(rect: Rectangle)
    {
        this.updateText(true);

        return super.getLocalBounds(rect);
    }

    _calculateBounds()
    {
        this.updateText(true);
        this.calculateVertices();
        // if we have already done this on THIS frame.
        (this as any)._bounds.addQuad(this.vertexData);
    }

    /**
     * Handle dirty style changes
     * @private
     */
    _onStyleChange()
    {
        this.dirty = true;
    }

    /**
     * Destroy this Text object. Don't use after calling.
     * @param {boolean|object} options - Same as Sprite destroy options.
     */
    destroy(options?: boolean | IDestroyOptions | undefined)
    {
        super.destroy(options);

        const forceClear: any = null;

        // make sure to reset the the context and canvas..
        // dont want this hanging around in memory!
        this.context = null as any;
        if (this.canvas)
        {
            this.canvas.width = this.canvas.height = 0; // Safari hack
        }
        this.canvas = forceClear;
        this._style = forceClear;
        this._svgRoot = forceClear;
        this._domElement = forceClear;
        this._foreignObject = forceClear;
        this._image.onload = null;
        this._image.src = '';
        this._image = forceClear;
    }

    /**
     * Get the width in pixels.
     * @member {number}
     */
    get width()
    {
        this.updateText(true);

        return Math.abs(this.scale.x) * this.canvas.width / this.resolution;
    }

    set width(value) // eslint-disable-line require-jsdoc
    {
        this.updateText(true);

        const s = utils.sign(this.scale.x) || 1;

        this.scale.x = s * value / this.canvas.width / this.resolution;
        this._width = value;
    }

    /**
     * Get the height in pixels.
     * @member {number}
     */
    get height()
    {
        this.updateText(true);

        return Math.abs(this.scale.y) * this.canvas.height / this.resolution;
    }

    set height(value) // eslint-disable-line require-jsdoc
    {
        this.updateText(true);

        const s = utils.sign(this.scale.y) || 1;

        this.scale.y = s * value / this.canvas.height / this.resolution;
        this._height = value;
    }

    /**
     * The base style to render with text.
     * @member {PIXI.TextStyle}
     */
    get style(): TextStyle
    {
        return this._style as TextStyle;
    }

    set style(style: TextStyle | Partial<ITextStyle>) // eslint-disable-line require-jsdoc
    {
        style = style || {};

        if (style instanceof TextStyle)
        {
            this._style = style;
        }
        else
        {
            this._style = new TextStyle(style);
        }

        this.localStyleID = -1;
        this.dirty = true;
    }

    /**
     * Contents of text. This can be HTML text and include tags.
     * @example
     * const text = new HTMLText('This is a <em>styled</em> text!');
     * @member {string}
     */
    get text()
    {
        return this._text;
    }

    set text(text) // eslint-disable-line require-jsdoc
    {
        text = String(text === '' || text === null || text === undefined ? ' ' : text);
        text = this.sanitiseText(text);

        if (this._text === text)
        {
            return;
        }
        this._text = text;
        this.dirty = true;
    }

    /**
     * The resolution / device pixel ratio of the canvas.
     * This is set to automatically match the renderer resolution by default, but can be overridden by setting manually.
     * @member {number}
     * @default 1
     */
    get resolution(): number
    {
        return this._resolution;
    }

    set resolution(value: number) // eslint-disable-line require-jsdoc
    {
        this._autoResolution = false;

        if (this._resolution === value)
        {
            return;
        }

        this._resolution = value;
        this.dirty = true;
    }

    sanitiseText(text: string): string
    {
        // Sanitise text - replace <br> with <br/>, &nbsp; with &#160;
        // See discussion here:
        // https://www.sitepoint.com/community/t/xhtml-1-0-transitional-xml-parsing-error-entity-nbsp-not-defined/3392/3
        return text
            .replace(/<br>/gi, '<br/>')
            .replace(/<hr>/gi, '<hr/>')
            .replace(/&nbsp;/gi, '&#160;');
    }
}
