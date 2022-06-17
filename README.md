# canvas-draw-table

使用 canvas 实现画表格，以及移动，拖拽，拉伸，删除，回撤等功能

[体验地址](https://test.yeshaojun.com/)

也可以在 github 上 clone 代码，直接打开 index.html

项目由来：有个报表识别的项目，识别结果可能不准确，需要在图片上二次编辑。在网上找了一圈，也没找到合适的框架，因此自己封装了一个，使用 canvas 绘制 table,并实现批量移动，拉伸，拖拽，删除，等功能

# 使用方式

```
import Draw from 'canvas-draw-table'

const draw = Draw({
    url: '', // 图片url，可不传
    dom: '', // canvas容器id或者dom,
    selectColor: "",
    selectActiveColor: "",
    drawSelectColor: "",
    defaultData: [
        {
            type: "cell",
            location: [
                [114, 100],
                [347, 100],
                [347, 229],
                [114, 229],
            ],
        }
    ]
}, modeChange: fn)

```

| 参数              | 类型       | 说明                 |
| ----------------- | ---------- | -------------------- |
| url               | string     | 背景图片地址(可省略) |
| dom               | string dom | canvas 容器          |
| selectColor       | string     | 线条颜色（可省略）   |
| selectActiveColor | string     | 选中颜色（可省略）   |
| drawSelectColor   | string     | 多选框颜色（可省略） |
| defaultData       | array      | 初始数据(可省略)     |

（如果传了 url,则 defaultData 数据是相对图片的坐标，否则是相对容器的坐标）

modeChange 模式改变的回调函数，模式一共有【选择，移动，拉伸，绘制】， 默认为选择模式（背景图片不可选中，不可删除）

想要手动改变模式，可以通过

```
draw.setMode(mode)

```

# 使用方式

```
          draw.setMode("draw", {
            type: "table",
            tr: 3,
            td: 4,
          });
```

绘制 table 的时候，setMode 需要第二个参数，并传入绘制的行列

删除

```
if(draw.current || draw.currentArray.length > 0) {
	draw.delete();
}


```

保存

```
if(!draw.noUpdate) {
	draw.saveDraw()
}

```

撤销/反撤销

```

if(draw.history.length > 0) {
	draw.revoke()
}

if(draw.deleteHistory.length > 0) {
	draw.reRevoke()
}


```

放大/缩小

```

draw.zoom('up')

draw.zoom('down')

```
