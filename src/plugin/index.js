class DrawCanvas {
  constructor(config, modeChange) {
    this.config = config;
    this.mode = "select"; // 框选, 移动，拉伸，画表格，选中
    this.drawType = {
      type: "cell",
      td: 1,
      tr: 1,
    };
    // 鼠标点击开始位置
    this.startX = 0;
    this.startY = 0;

    // 鼠标实时位置
    this.moveX = 0;
    this.moveY = 0;

    this.leftDistance = 0; // 点击单元格 点击位置距离左侧距离
    this.topDistance = 0; // 点击单元格 点击位置距离顶部距离
    // canvas对象
    this.c = null;
    this.ctx = null;

    this.resize = 6;
    this.mouseStatus = null;
    this.tableStatus = null;

    // 图层
    this.layers = [];
    // 操作历史，供撤销使用
    this.history = [];
    // 反撤销
    this.deleteHistory = [];
    // 添加历史记录的时候判断一下是否有有效操作，如果有则加入到历史记录
    this.isOpt = "";
    this.originCurrent = null;
    // 当前选择图层
    this.current = null;
    // 画表格是记录，坐标信息
    this.coord = null;
    this.currentArray = [];
    this.currentArrayItem = null;

    // 批量移动单元格基准线
    this.base = 0;
    this.scrollRateY = 20;
    this.scrollRateX = 20;
    this.timerX = null;
    this.timerY = null;
    this.timerTop = null;
    // 批量移动单元格， 需要移动的单元格
    this.cellMatchList = [];
    // 批量移动单元格， 需要跟随移动的单元格
    this.cellflowList = [];
    this.clientY = 0;
    this.clientX = 0;
    this.match = {
      type: "",
      index: 0,
    };
    // 是否需要修改
    this.noUpdate = true;
    //  保存当前修改
    this.saveCurrent = [];
    // 图片缩放倍数
    this.imgRate = 1;
    this.img = new Image();
    this.modeChange = modeChange;
    this.tempy = 0;

    this.selectColor = config.selectColor || "#666";
    this.selectActiveColor = config.selectActiveColor || "red";
    this.drawSelectColor = config.drawSelectColor || "#0099CC";
    this.init();
  }

  init() {
    if (typeof this.config.dom === "object" && "nodeType" in this.config.dom) {
      this.c = this.config.dom;
    } else {
      this.c = document.getElementById(this.config.dom);
    }
    this.ctx = this.c.getContext("2d");
    this.c.width = document.body.clientWidth;
    this.c.height = document.body.clientHeight - 64;
    this.addMouseEvent();
    if (this.config.url) {
      this.drawImage();
    } else {
      this.drawOriginData();
    }
    this.addKeyboard();
  }
  // 添加鼠标监听事件
  addMouseEvent() {
    this.c.onmousedown = this.mousedown.bind(this);
    this.c.onmousemove = this.mousemove.bind(this);
    this.c.onmouseup = this.mouseup.bind(this);
  }
  // 区分当前操作
  mousedown(e) {
    // 按住ctrlKey,为多选，可添加与取消
    // 如果当前为current,则不进行处理
    const point = this.windowToCanvas(e.clientX, e.clientY);
    this.startX = point.x;
    this.startY = point.y;
    this.mouseStatus = "down";
    switch (this.mode) {
      case "select":
        this.originCurrent = this.isPointInRetc(point.x, point.y);
        break;
      case "drawSelect":
        // 控制选择款只有一个
        var index = this.layers.findIndex((item) => item.type === "select");
        if (index !== -1) {
          this.layers.splice(index, 1);
        }
        break;
      case "move":
        // 移动模式要求 首先有选中，如没有则改为select模式，并判断是否有选中原则，如果没有则选中
        if (this.current) {
          // 移动
          let current = this.isPointInRetc(point.x, point.y);
          this.originCurrent = current;
          if (current) {
            this.leftDistance = point.x - current.x1;
            this.topDistance = point.y - current.y1;
          } else {
            this.mode = "select";
            if (this.current.type === "select") {
              // this.removeSelect()
            }
            this.current = null;
          }
        } else if (this.currentArray.length > 0) {
          // 多选中的->当前操作对象
          let current = this.isPointInRetc(point.x, point.y);
          this.originCurrent = [...this.currentArray];
          if (current) {
            this.currentArrayItem = current;
          } else {
            this.mode = "select";
            this.current = null;
            this.currentArray = [];
          }
        }
        break;
      case "draw":
        this.originCurrent = null;
        break;
    }
  }

  // 添加键盘监听事件，做一些常用快捷键
  addKeyboard() {
    document.addEventListener("keydown", (e) => {
      // delete
      // e.preventDefault()
      if (!e.key) {
        return;
      }
      if (e.key.toString().toLowerCase() === "delete") {
        this.delete();
      }

      if (
        (e.metaKey && e.key.toString().toLowerCase() === "z") ||
        (e.ctrlKey && e.key.toString().toLowerCase() === "z")
      ) {
        if (this.history.length > 0) {
          this.revoke();
        }
      }

      if (
        (e.metaKey && e.key.toString().toLowerCase() === "s") ||
        (e.ctrlKey && e.key.toString().toLowerCase() === "s")
      ) {
        if (!this.noUpdate) {
          this.saveDraw();
        }
      }

      if (e.ctrlKey && e.key === "=") {
        this.zoom("up");
      }

      if (e.ctrlKey && e.key === "-") {
        this.zoom("down");
      }
    });
  }
  // 鼠标抬起事件，做操作历史版本控制
  // 把选中放到mouseup中
  mouseup(e) {
    e.preventDefault();
    this.clearTimer();
    const point = this.windowToCanvas(e.clientX, e.clientY);
    this.mouseStatus = "up";
    this.tableStatus = "";
    let result = {};
    let cellList = [];
    this.match = {
      type: "",
      index: 0,
    };
    if (this.mode === "select" || this.mode === "move") {
      if (!this.isOpt) {
        // 如果当前是框选则不进行其他单元格的选中
        if (!this.current || this.current.type !== "select") {
          let current = this.isPointInRetc(point.x, point.y);
          if (current) {
            if (e.ctrlKey) {
              let index = this.currentArray.findIndex(
                (item) => item.key === current.key
              );
              if (index !== -1) {
                this.currentArray.splice(index, 1);
              } else {
                this.currentArray.push(current);
              }
            } else {
              this.current = current;
              this.currentArray = [];
            }
            this.c.style.cursor = "move";
          } else {
            this.c.style.cursor = "default";
          }
        }
      } else if (this.isOpt === "move" && this.currentArray.length > 0) {
        // 移动的时候，要做坐标计算，所以并未实时改变 this.currentArray的值
        // 在鼠标松开之后，重新赋值this.currentArray
        let arr = [];
        this.layers.forEach((item) => {
          let index = this.currentArray.findIndex((c) => c.key === item.key);
          if (index !== -1) {
            arr.push(item);
          }
        });
        this.currentArray = [...arr];
        this.current = null;
        this.base = 0;
        // 批量操作根据基准线匹配的单元格
        this.cellMatchList = [];
        this.cellflowList = [];
      }

      if (this.current) {
        this.mode = "move";
      } else {
        this.current = null;
      }
      this.draw();
    } else if (this.mode === "draw" && this.isOpt === "draw") {
      // 做个限制，table或者cell如果宽度和高度小于resize则不进行绘制
      if (
        Math.abs(this.moveX - this.startX) > 2 * this.resize &&
        Math.abs(this.moveY - this.startY) > 2 * this.resize
      ) {
        // 添加到图层中，单元格以及table
        const type = this.mode === "drawSelect" ? "select" : this.drawType.type;
        // 如果是table,把table转化为单元格
        if (type === "table") {
          // 计算单元格
          let td = this.drawType.td;
          let tr = this.drawType.tr;
          let w = this.moveX - this.startX;
          let h = this.moveY - this.startY;
          for (let i = 0; i < td; i++) {
            for (let j = 0; j < tr; j++) {
              let x1 = this.startX + (w / td) * i;
              let x2 = this.startX + (w / td) * (i + 1);
              let y1 = this.startY + (h / tr) * j;
              let y2 = this.startY + (h / tr) * (j + 1);
              let temp = this.fixPosition({
                x1,
                y1,
                x2,
                y2,
                type: "cell",
                key: new Date().getTime() + "cell" + x1 + y1,
                location: this.getCellLocation("", {
                  x1,
                  x2,
                  y1,
                  y2,
                }),
              });
              cellList.push(temp);
              this.layers.push(temp);
            }
          }
          this.c.style.cursor = "default";
          this.currentArray = cellList;
        } else {
          const key =
            new Date().getTime() +
            (this.mode === "drawSelect" ? "select" : this.drawType.type) +
            this.startX +
            this.startY;
          result = this.fixPosition({
            x1: this.startX,
            y1: this.startY,
            x2: this.moveX,
            y2: this.moveY,
            type: type,
            key: key,
            coord: this.coord,
            h: this.drawType.tr,
            w: this.drawType.td,
            location: this.getCellLocation("draw"),
            coordLocation:
              this.drawType.type === "table"
                ? this.getTableLocation("draw")
                : {},
          });
          this.layers.push(result);
          this.current = result;
        }
        this.mode = "move";
        this.c.style.cursor = "default";
        this.modeChange("select");
      } else {
        this.isOpt = "";
      }
      this.draw();
    } else if (this.mode === "drawSelect") {
      const key =
        new Date().getTime() +
        (this.mode === "drawSelect" ? "select" : this.drawType.type) +
        this.startX +
        this.startY;
      this.findSelectArray(
        this.fixPosition({
          x1: this.startX,
          y1: this.startY,
          x2: this.moveX,
          y2: this.moveY,
          type: "select",
          key: key,
          location: this.getCellLocation("draw"),
        })
      );
      this.isOpt = "";
      this.mode = "move";
      this.c.style.cursor = "default";
      this.current = null;
      this.modeChange("select");
      this.draw();
    }

    // 框选不作为撤销的历史记录
    if (this.isOpt && this.mode !== "drawSelect") {
      // 选择款，如果没有选中单元格的移动，不记录历史记录
      if (
        this.current &&
        this.current.type === "select" &&
        this.currentArray.length === 0
      ) {
        return;
      }
      this.noUpdate = this.checkIsSave();
      // 则存历史记录
      if (this.history.length >= this.config.historyCount) {
        this.history.shift();
      }
      // 批量移动单元格
      if (this.current && this.current.type === "select") {
        let arr = [];
        this.layers.forEach((item) => {
          this.currentArray.forEach((c) => {
            if (item.key === c.key) {
              arr.push({
                ...item,
              });
            }
          });
        });
        this.history.push({
          type: this.isOpt,
          data: arr,
          originData: [...this.currentArray],
          selectOpt: true,
        });
        this.deleteHistory = [];
        this.currentArray = arr;
      } else {
        if (this.currentArray.length > 0) {
          this.history.push({
            type: this.isOpt,
            data: [...this.currentArray],
            originData: this.originCurrent ? [...this.originCurrent] : null,
            selectOpt: true,
          });
        } else {
          // 数据直接赋值可能会有问题
          let result = this.current || result;
          this.history.push({
            type: this.isOpt,
            data: {
              ...result,
            },
            originData: {
              ...this.originCurrent,
            },
          });
        }
        this.deleteHistory = [];
      }
      this.isOpt = "";
    }
  }

  // 鼠标移动
  mousemove(e) {
    e.preventDefault();
    const point = this.windowToCanvas(e.clientX, e.clientY);
    this.moveX = point.x;
    this.moveY = point.y;
    // 自动滚动
    if (this.mouseStatus === "down" && this.mode !== "select") {
      let dom = this.c.parentElement;
      let ch = dom.clientHeight;
      let cw = dom.clientWidth;
      // 可滚动的高度
      let scrowH = this.c.height - ch;
      let scrowW = this.c.width - cw;
      if (point.y - dom.scrollTop >= dom.clientHeight - 2) {
        clearInterval(this.timerY);
        this.timerY = setInterval(() => {
          if (this.scrollRateY >= scrowH) {
            clearInterval(this.timerY);
            this.timerY = null;
          }
          if (e.clientY - this.tempy < -1) {
            clearInterval(this.timerY);
            this.timerY = null;
          } else {
            this.tempy = e.clientY;
          }
          // this.scrollRateY += 10
          dom.scrollTop += this.scrollRateY / 2;
        }, 60);
      } else {
        clearInterval(this.timerY);
        this.scrollRateY = 20;
      }
      if (e.clientX > cw - 2) {
        clearInterval(this.timerX);
        this.timerX = setInterval(() => {
          if (this.scrollRateX >= scrowW) {
            clearInterval(this.timerX);
            this.timerX = null;
          }
          // this.scrollRateX += 10
          dom.scrollLeft += this.scrollRateX / 2;
        }, 60);
      } else {
        clearInterval(this.timerX);
        this.scrollRateX = 20;
      }

      // 在做一个向上滚动的兼容
      const scrolll = dom.scrollTop;
      if (scrolll > 0 && e.clientY < 80) {
        clearInterval(this.timerTop);
        this.timerTop = setInterval(() => {
          if (scrolll <= 0) {
            clearInterval(this.timerTop);
            this.timerTop = null;
          }
          // this.scrollRateY += 10
          dom.scrollTop -= this.scrollRateY / 2;
        }, 60);
      } else {
        clearInterval(this.timerTop);
        this.scrollRateY = 20;
      }
    }
    if (this.mode === "move") {
      if (this.current) {
        if (
          (this.current.x1 + this.resize <= this.moveX &&
            this.current.x2 - this.resize >= this.moveX &&
            this.current.y1 + this.resize <= this.moveY &&
            this.current.y2 - this.resize >= this.moveY) ||
          this.tableStatus === "moving"
        ) {
          this.c.style.cursor = "move";
          if (this.mouseStatus === "down") {
            this.movetable();
          }
        } else {
          this.c.style.cursor = "default";
        }
        // 框选也不支持响应大小
        if (this.current.type !== "select") {
          this.reSizeTable();
        }
      } else if (this.currentArray.length > 0) {
        // 单个选中逻辑不变，多个选中走这条线
        // 多个选中，只支持四个方向移动，不支持整体缩放
        if (this.checkMultiple()) {
          this.c.style.cursor = "move";
          if (this.mouseStatus === "down") {
            this.movetable();
          }
        } else {
          this.c.style.cursor = "default";
        }
        this.resizeMultipleCell();
      }
    }

    if (
      (this.mode === "draw" && this.mouseStatus === "down") ||
      (this.mode === "drawSelect" && this.mouseStatus === "down")
    ) {
      this.ctx.save();
      this.ctx.beginPath();
      this.draw();
      this.ctx.setLineDash([5]);
      this.c.style.cursor = "crosshair";
      if (this.mode === "drawSelect") {
        this.ctx.strokeStyle = this.selectColor;
        this.ctx.rect(
          this.startX,
          this.startY,
          this.moveX - this.startX,
          this.moveY - this.startY
        );
      } else {
        // 画表格跟单元格
        this.coord = {
          tr: [], // 横线
          td: [], // 竖线
        };
        // 画横线
        // table 需要计算行列
        for (let i = 0; i <= this.drawType.tr; i++) {
          this.ctx.moveTo(
            this.startX,
            this.startY + (i * (this.moveY - this.startY)) / this.drawType.tr
          );
          this.ctx.lineTo(
            this.moveX,
            this.startY + (i * (this.moveY - this.startY)) / this.drawType.tr
          );
          this.coord.tr.push({
            x1: this.startX,
            y1:
              this.startY + (i * (this.moveY - this.startY)) / this.drawType.tr,
            x2: this.moveX,
            y2:
              this.startY + (i * (this.moveY - this.startY)) / this.drawType.tr,
          });
        }

        // 画竖线
        for (let j = 0; j <= this.drawType.td; j++) {
          this.ctx.moveTo(
            this.startX + (j * (this.moveX - this.startX)) / this.drawType.td,
            this.startY
          );
          this.ctx.lineTo(
            this.startX + (j * (this.moveX - this.startX)) / this.drawType.td,
            this.moveY
          );
          this.coord.td.push({
            x1:
              this.startX + (j * (this.moveX - this.startX)) / this.drawType.td,
            y1: this.startY,
            x2:
              this.startX + (j * (this.moveX - this.startX)) / this.drawType.td,
            y2: this.moveY,
          });
        }
      }
      this.isOpt = "draw";
      this.ctx.stroke();
      this.ctx.restore();
    }
  }

  clearTimer() {
    clearInterval(this.timerY);
    clearInterval(this.timerY);
    clearInterval(this.timerTop);
    this.timerY = null;
    this.timerX = null;
    this.timerTop = null;
    this.scrollRateY = 20;
    this.scrollRateX = 20;
    this.tempy = 0;
  }

  // 多选的时候，判断鼠标是否在图层内
  checkMultiple() {
    let result = false;
    this.currentArray.forEach((item) => {
      if (
        (item.x1 + this.resize <= this.moveX &&
          item.x2 - this.resize >= this.moveX &&
          item.y1 + this.resize <= this.moveY &&
          item.y2 - this.resize >= this.moveY) ||
        this.tableStatus === "moving"
      ) {
        result = true;
      }
    });
    return result;
  }

  // 多选的时候 批量调整单元格行列
  resizeMultipleCell() {
    if (this.tableStatus === "moving") {
      return;
    }
    let list = [...this.currentArray];
    let point = "";

    for (let i = 0; i < list.length; i++) {
      if (
        this.moveX >= list[i].x1 &&
        this.moveX <= list[i].x1 + this.resize &&
        this.moveY >= list[i].y1 &&
        this.moveY <= list[i].y2 &&
        this.tableStatus !== "m-left-resize"
      ) {
        if (this.moveX >= list[i].x1 + 1) {
          this.c.style.cursor = "w-resize";
        }
        point = "left";
        this.base = list[i].x1;
        break;
      } else if (
        this.moveX < list[i].x2 &&
        this.moveX >= list[i].x2 - this.resize &&
        this.moveY >= list[i].y1 &&
        this.moveY <= list[i].y2 &&
        this.tableStatus !== "m-right-resize"
      ) {
        if (this.moveX < list[i].x2 - 1) {
          this.c.style.cursor = "e-resize";
        }
        point = "right";
        this.base = list[i].x2;
        break;
      } else if (
        this.moveX <= list[i].x2 - this.resize &&
        this.moveX >= list[i].x1 + this.resize &&
        this.moveY <= list[i].y1 + this.resize &&
        this.moveY >= list[i].y1 &&
        this.tableStatus !== "m-top-resize"
      ) {
        point = "top";
        this.base = list[i].y1;
        break;
      } else if (
        this.moveX <= list[i].x2 - this.resize &&
        this.moveX >= list[i].x1 + this.resize &&
        this.moveY <= list[i].y2 &&
        this.moveY >= list[i].y2 - this.resize &&
        this.tableStatus !== "m-bottom-resize"
      ) {
        point = "bottom";
        this.base = list[i].y2;
        break;
      }
    }
    if ((point && point === "left") || this.tableStatus === "m-left-resize") {
      if (this.tableStatus === "m-left-resize") {
        this.c.style.cursor = "w-resize";
      }
      this.resizeMultipleLeft(this.base, list);
    } else if (
      (point && point === "right") ||
      this.tableStatus === "m-right-resize"
    ) {
      if (this.tableStatus === "m-right-resize") {
        this.c.style.cursor = "e-resize";
      }
      this.resizeMultipleRight(this.base, list);
    } else if (
      (point && point === "top") ||
      this.tableStatus === "m-top-resize"
    ) {
      this.resizeMultipleTop(this.base, list);
    } else if (
      (point && point === "bottom") ||
      this.tableStatus === "m-bottom-resize"
    ) {
      this.resizeMultipleBottom(this.base, list);
    }
  }

  // 批量左侧移动
  resizeMultipleLeft(base, list) {
    // this.c.style.cursor = 'w-resize'
    if (
      this.mouseStatus === "down" &&
      (this.tableStatus === "m-left-resize" || !this.tableStatus)
    ) {
      this.tableStatus = "m-left-resize";
      if (this.cellMatchList.length === 0) {
        // 选中在基准线附近的单元格
        list.forEach((item) => {
          if (item.x1 > base - this.resize && item.x1 < base + this.resize) {
            this.cellMatchList.push(item);
          }

          if (item.x2 > base - this.resize && item.x2 < base + this.resize) {
            this.cellflowList.push(item);
          }
        });
      }
      // 就算偏移量
      this.layers.forEach((item, i) => {
        let index = this.cellMatchList.findIndex((c) => c.key === item.key);
        let flowIndex = this.cellflowList.findIndex((c) => c.key === item.key);
        if (index !== -1) {
          let max =
            this.getMinWidthByCellList("max", this.cellMatchList) -
            2 * this.resize;
          let x1 =
            this.cellMatchList[index].x1 + this.moveX - this.startX < max
              ? this.cellMatchList[index].x1 + this.moveX - this.startX
              : max;
          // 如果this.cellflowList存在，则限制他不能小于前面的x1 + 3 * this.resize
          if (this.cellflowList.length > 0) {
            let min =
              this.getMinWidthByCellList("min", this.cellflowList) +
              2 * this.resize;
            x1 = x1 < min ? min : x1;
          }
          this.layers[i] = {
            ...item,
            x1,
            location: this.getCellLocation("move", {
              ...item,
              x1,
            }),
          };
        }

        if (flowIndex !== -1) {
          // 操作
          // 如果有需求，应该算数组里面的最小值
          let min =
            this.getMinWidthByCellList("min", this.cellflowList) +
            2 * this.resize;
          let max =
            this.getMinWidthByCellList("max", this.cellMatchList) -
            2 * this.resize;
          let x2 =
            this.cellflowList[flowIndex].x2 + this.moveX - this.startX > min
              ? this.cellflowList[flowIndex].x2 + this.moveX - this.startX
              : min;
          x2 = x2 < max ? x2 : max;
          this.layers[i] = {
            ...item,
            x2,
            location: this.getCellLocation("move", {
              ...item,
              x2,
            }),
          };
        }
      });
      this.isOpt = "move";
      this.draw();
    }
  }

  // 批量右边移动
  resizeMultipleRight(base, list) {
    // this.c.style.cursor = 'e-resize'
    if (
      this.mouseStatus === "down" &&
      (this.tableStatus === "m-right-resize" || !this.tableStatus)
    ) {
      this.tableStatus = "m-right-resize";
      if (this.cellMatchList.length === 0) {
        list.forEach((item) => {
          if (item.x2 > base - this.resize && item.x2 < base + this.resize) {
            this.cellMatchList.push(item);
          }
          if (item.x1 > base - this.resize && item.x1 < base + this.resize) {
            this.cellflowList.push(item);
          }
        });
      }

      this.layers.forEach((item, i) => {
        let index = this.cellMatchList.findIndex((c) => c.key === item.key);
        let flowIndex = this.cellflowList.findIndex((c) => c.key === item.key);
        // x2
        if (index !== -1) {
          let min =
            this.getMinWidthByCellList("min", this.cellMatchList) +
            2 * this.resize;
          let x2 =
            this.cellMatchList[index].x2 + this.moveX - this.startX > min
              ? this.cellMatchList[index].x2 + this.moveX - this.startX
              : min;
          // 如果this.cellflowList存在，则限制他不能小于前面的x1 + 3 * this.resize
          if (this.cellflowList.length > 0) {
            let max =
              this.getMinWidthByCellList("max", this.cellflowList) -
              2 * this.resize;
            x2 = x2 > max ? max : x2;
          }
          this.layers[i] = {
            ...item,
            x2,
            location: this.getCellLocation("move", {
              ...item,
              x2,
            }),
          };
        }

        if (flowIndex !== -1) {
          // 操作
          // 如果有需求，应该算数组里面的最小值
          let min =
            this.getMinWidthByCellList("min", this.cellMatchList) +
            2 * this.resize;
          let max =
            this.getMinWidthByCellList("max", this.cellflowList) -
            2 * this.resize;
          let x1 =
            this.cellflowList[flowIndex].x1 + this.moveX - this.startX > min
              ? this.cellflowList[flowIndex].x1 + this.moveX - this.startX
              : min;
          x1 = x1 < max ? x1 : max;
          this.layers[i] = {
            ...item,
            x1,
            location: this.getCellLocation("move", {
              ...item,
              x1,
            }),
          };
        }
      });

      this.isOpt = "move";
      this.draw();
    }
  }

  // 批量顶部移动
  resizeMultipleTop(base, list) {
    this.c.style.cursor = "n-resize";
    if (
      this.mouseStatus === "down" &&
      (this.tableStatus === "m-top-resize" || !this.tableStatus)
    ) {
      this.tableStatus = "m-top-resize";
      if (this.cellMatchList.length === 0) {
        list.forEach((item) => {
          if (item.y1 > base - this.resize && item.y1 < base + this.resize) {
            this.cellMatchList.push(item);
          }

          if (item.y2 > base - this.resize && item.y2 < base + this.resize) {
            this.cellflowList.push(item);
          }
        });
      }
      this.layers.forEach((item, i) => {
        let index = this.cellMatchList.findIndex((c) => c.key === item.key);
        let flowIndex = this.cellflowList.findIndex((c) => c.key === item.key);
        if (index !== -1) {
          let max =
            this.getMinHeightByCellList("max", this.cellMatchList) -
            2 * this.resize;
          let y1 =
            this.cellMatchList[index].y1 + this.moveY - this.startY < max
              ? this.cellMatchList[index].y1 + this.moveY - this.startY
              : max;
          // 如果this.cellflowList存在，则限制他不能小于前面的x1 + 3 * this.resize
          if (this.cellflowList.length > 0) {
            let min =
              this.getMinHeightByCellList("min", this.cellflowList) +
              2 * this.resize;
            y1 = y1 < min ? min : y1;
          }
          this.layers[i] = {
            ...item,
            y1,
            location: this.getCellLocation("move", {
              ...item,
              y1,
            }),
          };
        }

        if (flowIndex !== -1) {
          let min =
            this.getMinHeightByCellList("min", this.cellflowList) +
            2 * this.resize;
          let max =
            this.getMinHeightByCellList("max", this.cellMatchList) -
            2 * this.resize;
          let y2 =
            this.cellflowList[flowIndex].y2 + this.moveY - this.startY > min
              ? this.cellflowList[flowIndex].y2 + this.moveY - this.startY
              : min;
          y2 = y2 > max ? max : y2;
          this.layers[i] = {
            ...item,
            y2,
            location: this.getCellLocation("move", {
              ...item,
              y2,
            }),
          };
        }
      });
      this.isOpt = "move";
      this.draw();
    }
  }

  // 批量底部异动
  resizeMultipleBottom(base, list) {
    this.c.style.cursor = "s-resize";
    if (
      this.mouseStatus === "down" &&
      (this.tableStatus === "m-bottom-resize" || !this.tableStatus)
    ) {
      this.tableStatus = "m-bottom-resize";
      if (this.cellMatchList.length === 0) {
        list.forEach((item) => {
          if (item.y2 > base - this.resize && item.y2 < base + this.resize) {
            this.cellMatchList.push(item);
          }

          if (item.y1 > base - this.resize && item.y1 < base + this.resize) {
            this.cellflowList.push(item);
          }
        });
      }

      this.layers.forEach((item, i) => {
        let index = this.cellMatchList.findIndex((c) => c.key === item.key);
        let flowIndex = this.cellflowList.findIndex((c) => c.key === item.key);
        if (index !== -1) {
          let min =
            this.getMinHeightByCellList("min", this.cellMatchList) +
            2 * this.resize;
          let y2 =
            this.cellMatchList[index].y2 + this.moveY - this.startY > min
              ? this.cellMatchList[index].y2 + this.moveY - this.startY
              : min;
          // 如果this.cellflowList存在，则限制他不能小于前面的x1 + 3 * this.resize
          if (this.cellflowList.length > 0) {
            let max =
              this.getMinHeightByCellList("max", this.cellflowList) -
              2 * this.resize;
            y2 = y2 > max ? max : y2;
          }
          this.layers[i] = {
            ...item,
            y2,
            location: this.getCellLocation("move", {
              ...item,
              y2,
            }),
          };
        }

        if (flowIndex !== -1) {
          let min =
            this.getMinHeightByCellList("min", this.cellMatchList) +
            2 * this.resize;
          let max =
            this.getMinHeightByCellList("max", this.cellflowList) -
            2 * this.resize;
          let y1 =
            this.cellflowList[flowIndex].y1 + this.moveY - this.startY > min
              ? this.cellflowList[flowIndex].y1 + this.moveY - this.startY
              : min;
          y1 = y1 > max ? max : y1;
          this.layers[i] = {
            ...item,
            y1,
            location: this.getCellLocation("move", {
              ...item,
              y1,
            }),
          };
        }
      });
      this.isOpt = "move";
      this.draw();
    }
  }

  // 从匹配中获取最大值，最小值
  // 取最大的x1跟最小的x2
  getMinWidthByCellList(str, list) {
    let min = list[0].x1;
    let max = list[0].x2;
    // str 空， min, max
    list.forEach((item) => {
      if (item.x2 < max) {
        max = item.x2;
      }
      if (item.x1 > min) {
        min = item.x1;
      }
    });
    return str
      ? str === "min"
        ? min
        : max
      : {
          min: min,
          max: max,
        };
  }

  // 从匹配中获取最大值，最小值
  // 取最大的y1跟最小的y2
  getMinHeightByCellList(str, list) {
    let min = list[0].y1;
    let max = list[0].y2;
    // str 空， min, max
    list.forEach((item) => {
      if (item.y2 < max) {
        max = item.xy;
      }
      if (item.y1 > min) {
        min = item.y1;
      }
    });
    return str
      ? str === "min"
        ? min
        : max
      : {
          min: min,
          max: max,
        };
  }
  // 画图
  drawImage() {
    this.img.src = this.config.url;
    this.img.key = new Date();
    this.img.onload = () => {
      let rateX = this.img.width / this.c.width;
      let rateY = this.img.height / this.c.height;
      let max = rateX > rateY ? rateX : rateY;
      if (max > 1) {
        this.imgRate = 1 / max;
      } else {
        if (rateX > rateY) {
          this.imgRate = (this.c.width - 40) / this.img.width;
        } else {
          this.imgRate = (this.c.height - 40) / this.img.height;
        }
      }
      this.layers.push(this.getImgCoord());
      this.drawOriginData();
      this.draw();
    };
  }
  // 回显table表单
  drawOriginData() {
    if (this.config.defaultData && this.config.defaultData.length > 0) {
      let imgleft = this.layers[0]?.x1 || 0;
      let imgtop = this.layers[0]?.y1 || 0;
      this.config.defaultData.forEach((item) => {
        const location = item.location;
        if (location.length > 0) {
          this.layers.push({
            x1: location[0][0] * this.imgRate + imgleft,
            y1: location[0][1] * this.imgRate + imgtop,
            x2: location[1][0] * this.imgRate + imgleft,
            y2: location[2][1] * this.imgRate + imgtop,
            strokeStyle: this.drawSelectColor,
            location,
            type: "cell",
            w: 1,
            h: 1,
            key:
              new Date().getTime() +
              "cell" +
              location[0][0] +
              imgleft +
              location[0][1] +
              imgtop,
          });
        }
      });
      this.draw();
    }
  }
  // 获取图片坐标
  getImgCoord() {
    let w = this.img.width * this.imgRate;
    let h = this.img.height * this.imgRate + 20;
    let x1 = 0;
    if (w < this.c.width) {
      x1 = (this.c.width - w) / 2;
    }
    if (w > this.c.width) {
      this.c.width = w;
    }
    if (h > this.c.height) {
      this.c.height = h;
    }

    if (w < this.c.width && h < this.c.height) {
      this.c.width =
        w > document.body.clientWidth ? w : document.body.clientWidth;
      this.c.height =
        h > document.body.clientHeight - 64
          ? h
          : document.body.clientHeight - 64;
    }

    return {
      type: "img",
      x1,
      x2: x1 + w,
      y1: 20,
      y2: h,
      isOpt: false,
      key: new Date().getTime() + "img" + x1 + 0,
    };
  }

  draw() {
    // 这个是否需要
    this.ctx.clearRect(0, 0, this.c.width, this.c.height);
    let arr = [];
    this.layers.forEach((item) => {
      this.ctx.beginPath();
      this.ctx.setLineDash([]);
      this.ctx.lineWidth = 1;
      if (item.type === "img") {
        this.ctx.drawImage(
          this.img,
          item.x1,
          item.y1,
          item.x2 - item.x1,
          item.y2 - item.y1
        );
      } else if (item.type === "cell" || item.type === "select") {
        // 把选中图层放到最后渲染
        if (
          (this.current && this.current.key === item.key) ||
          (this.currentArray.length > 0 &&
            this.currentArray.findIndex((obj) => obj.key === item.key) !== -1)
        ) {
          arr.push(item);
        } else {
          item.strokeStyle = this.drawSelectColor;
          this.ctx.rect(item.x1, item.y1, item.x2 - item.x1, item.y2 - item.y1);
        }
      } else if (item.type === "table") {
        if (this.current && this.current.key === item.key) {
          item.strokeStyle = this.selectActiveColor;
          item.lineWidth = 2;
        } else {
          item.strokeStyle = this.drawSelectColor;
        }
        if (
          this.currentArray.length > 0 &&
          this.current &&
          this.current.type === "select"
        ) {
          let index = this.currentArray.findIndex(
            (obj) => obj.key === item.key
          );
          if (index !== -1) {
            item.strokeStyle = this.selectActiveColor;
            item.lineWidth = 2;
          }
        }
        for (let i = 0; i <= item.h; i++) {
          this.ctx.moveTo(item.coord.tr[i].x1, item.coord.tr[i].y1);
          this.ctx.lineTo(item.coord.tr[i].x2, item.coord.tr[i].y2);
        }
        for (let j = 0; j <= item.w; j++) {
          this.ctx.moveTo(item.coord.td[j].x1, item.coord.td[j].y1);
          this.ctx.lineTo(item.coord.td[j].x2, item.coord.td[j].y2);
        }
      }
      this.ctx.strokeStyle = item.strokeStyle;
      this.ctx.lineWidth = item.lineWidth || 1;
      this.ctx.stroke();
    });
    arr.forEach((item) => {
      this.ctx.beginPath();
      this.ctx.rect(item.x1, item.y1, item.x2 - item.x1, item.y2 - item.y1);
      this.ctx.strokeStyle = this.selectActiveColor;
      this.ctx.lineWidth = 2;
      this.ctx.stroke();
    });
  }
  // 获取滚动条距离
  getScroll() {
    return {
      top: this.ctx.parent.scrollTop,
      left: this.ctx.parent.scrollLeft,
    };
  }
  // 缩放
  zoom(str) {
    if (str === "up") {
      this.imgRate += 0.1;
    } else {
      if (this.imgRate <= 0.2) {
        if (this.imgRate <= 0.02) {
          return;
        }
        this.imgRate -= 0.01;
      } else {
        this.imgRate -= 0.1;
      }
    }
    this.Recalculate();
    // 如果current存在
    if (this.current) {
      let index = this.layers.findIndex(
        (item) => item.key === this.current.key
      );
      this.current = {
        index: index,
        ...this.layers[index],
      };
    }
    if (this.currentArray.length > 0) {
      let arr = [];
      this.layers.forEach((item) => {
        let index = this.currentArray.findIndex((c) => c.key === item.key);
        if (index !== -1) {
          arr.push(item);
        }
      });
      this.currentArray = [...arr];
    }
  }
  // 缩放之后所有的图层需要重新计算
  Recalculate() {
    let imgleft = 0;
    let imgtop = 0;
    if (this.layers[0].type === "image") {
      this.layers[0] = this.getImgCoord();
      imgleft = this.layers[0].x1;
      imgtop = this.layers[0].y1;
    }

    this.layers.forEach((item) => {
      if (item.type !== "img") {
        if (item.location) {
          item.x1 = item.location[0][0] * this.imgRate + imgleft;
          item.y1 = item.location[0][1] * this.imgRate + imgtop;
          item.x2 = item.location[1][0] * this.imgRate + imgleft;
          item.y2 = item.location[2][1] * this.imgRate + imgtop;
          if (item.type === "table") {
            let td = [],
              tr = [];
            item.coordLocation.td.forEach((item) => {
              td.push({
                x1: item.x1 * this.imgRate + imgleft,
                x2: item.x2 * this.imgRate + imgleft,
                y1: item.y1 * this.imgRate + imgtop,
                y2: item.y2 * this.imgRate + imgtop,
              });
            });
            item.coordLocation.tr.forEach((item) => {
              tr.push({
                x1: item.x1 * this.imgRate + imgleft,
                x2: item.x2 * this.imgRate + imgleft,
                y1: item.y1 * this.imgRate + imgtop,
                y2: item.y2 * this.imgRate + imgtop,
              });
            });
            item.coord = {
              td,
              tr,
            };
          }
        }
      }
    });
    this.draw();
  }

  isPointInRetc(x, y) {
    for (let i = 0; i < this.layers.length; i++) {
      if (
        this.layers[i].type === "table" ||
        this.layers[i].type === "cell" ||
        this.layers[i].type === "select"
      ) {
        if (
          this.layers[i].x1 <= x &&
          x <= this.layers[i].x2 &&
          this.layers[i].y1 <= y &&
          y <= this.layers[i].y2
        ) {
          return {
            ...this.layers[i],
            index: i,
          };
        }
      }
    }
  }

  windowToCanvas(x, y) {
    const bbox = this.c.getBoundingClientRect();
    return {
      x: x - bbox.left,
      y: y - bbox.top,
    };
  }

  reSizeTable() {
    // 只判断当前的
    if (
      (this.moveX >= this.current.x1 &&
        this.moveX <= this.current.x1 + this.resize &&
        this.moveY >= this.current.y1 &&
        this.moveY <= this.current.y2) ||
      this.tableStatus === "left-resize"
    ) {
      this.resizeLeft();
    } else if (
      (this.moveX <= this.current.x2 &&
        this.moveX >= this.current.x2 - this.resize &&
        this.moveY >= this.current.y1 &&
        this.moveY <= this.current.y2) ||
      this.tableStatus === "right-resize"
    ) {
      this.resizeRight();
    } else if (
      (this.moveY >= this.current.y1 &&
        this.moveY <= this.current.y1 + this.resize &&
        this.moveX >= this.current.x1 + this.resize &&
        this.moveX <= this.current.x2 - this.resize) ||
      this.tableStatus === "top-resize"
    ) {
      this.resizeTop();
    } else if (
      (this.moveY >= this.current.y2 - this.resize &&
        this.moveY < this.current.y2 &&
        this.moveX >= this.current.x1 + this.resize &&
        this.moveX < this.current.x2 - this.resize) ||
      this.tableStatus === "bottom-resize"
    ) {
      this.resizeBottom();
    } else if (
      (this.moveX >= this.current.x1 &&
        this.moveX <= this.current.x1 + this.resize &&
        this.moveY >= this.current.y1 &&
        this.moveY <= this.current.y1 + this.resize) ||
      this.tableStatus === "lt-resize"
    ) {
      this.resizeLT();
    } else if (
      (this.moveX <= this.current.x2 &&
        this.moveX >= this.current.x2 - this.resize &&
        this.moveY >= this.current.y1 &&
        this.moveY <= this.current.y1 + this.resize) ||
      this.tableStatus === "rt-resize"
    ) {
      this.resizeRT();
    } else if (
      (this.moveX >= this.current.x1 &&
        this.moveX <= this.current.x1 + this.resize &&
        this.moveY <= this.current.y2 &&
        this.moveY >= this.current.y2 - this.resize) ||
      this.tableStatus === "lb-resize"
    ) {
      this.resizeBL();
    } else if (
      (this.moveX <= this.current.x2 &&
        this.moveX >= this.current.x2 - this.resize &&
        this.moveY <= this.current.y2 &&
        this.moveY >= this.current.y2 - this.resize) ||
      this.tableStatus === "rb-resize"
    ) {
      this.resizeBR();
    } else if (
      this.current.type === "table" &&
      this.moveX > this.current.x1 + this.resize &&
      this.moveX < this.current.x2 - this.resize &&
      this.moveY > this.current.y1 + this.resize &&
      this.moveY < this.current.y2 - this.resize
    ) {
      let td = [...this.current.coord.td];
      let tr = [...this.current.coord.tr];
      let isMatch = false;
      for (let i = 1; i < tr.length - 1; i++) {
        if (
          this.moveY > tr[i].y1 - this.resize &&
          this.moveY < tr[i].y1 + this.resize &&
          this.tableStatus !== "table-resize"
        ) {
          isMatch = true;
          this.match.type = "tr";
          this.match.index = i;
          this.c.style.cursor = "n-resize";
          break;
        }
      }

      for (let i = 1; i < td.length - 1; i++) {
        if (
          this.moveX > td[i].x1 - this.resize &&
          this.moveX < td[i].x1 + this.resize &&
          this.tableStatus !== "table-resize"
        ) {
          isMatch = true;
          this.match.type = "td";
          this.match.index = i;
          this.c.style.cursor = "w-resize";
          break;
        }
      }
      if (
        (isMatch || this.tableStatus === "table-resize") &&
        this.mouseStatus === "down"
      ) {
        this.resizeTableLine(this.match);
      }
    }
  }

  // 移动表格
  movetable() {
    if (this.tableStatus && this.tableStatus !== "moving") {
      return;
    }
    this.tableStatus = "moving";
    if (this.current) {
      const xd = this.moveX - this.leftDistance - this.current.x1;
      const yd = this.moveY - this.topDistance - this.current.y1;
      this.current.x2 += xd;
      this.current.x1 += xd;
      this.current.y2 += yd;
      this.current.y1 += yd;

      if (this.current.type === "table") {
        let tr = [],
          td = [];
        this.current.coord.tr.forEach((r) => {
          tr.push({
            x1: r.x1 + xd,
            y1: r.y1 + yd,
            x2: r.x2 + xd,
            y2: r.y2 + yd,
          });
        });

        this.current.coord.td.forEach((d) => {
          td.push({
            x1: d.x1 + xd,
            y1: d.y1 + yd,
            x2: d.x2 + xd,
            y2: d.y2 + yd,
          });
        });
        this.current.coord = {
          tr,
          td,
        };
      } else if (this.current.type === "select") {
        if (this.currentArray.length > 0) {
          this.layers.forEach((item, idx) => {
            this.currentArray.forEach((s) => {
              if (s.key === item.key) {
                this.layers[idx].x2 += xd;
                this.layers[idx].x1 += xd;
                this.layers[idx].y2 += yd;
                this.layers[idx].y1 += yd;
                this.layers[idx].location = this.getCellLocation("move", item);
                if (item.type === "table") {
                  let tr = [],
                    td = [];
                  item.coord.tr.forEach((r) => {
                    tr.push({
                      x1: r.x1 + xd,
                      y1: r.y1 + yd,
                      x2: r.x2 + xd,
                      y2: r.y2 + yd,
                    });
                  });

                  item.coord.td.forEach((d) => {
                    td.push({
                      x1: d.x1 + xd,
                      y1: d.y1 + yd,
                      x2: d.x2 + xd,
                      y2: d.y2 + yd,
                    });
                  });
                  this.layers[idx].coord = {
                    td,
                    tr,
                  };
                  this.layers[idx].coordLocation = this.getTableLocation(
                    "move",
                    item
                  );
                }
              }
            });
          });
        }
      }
      this.dealData("move");
    } else if (this.currentArray.length > 0) {
      let index = "";
      this.currentArray.forEach((item) => {
        if (item.index) {
          index = item.index;
        } else {
          index = this.layers.findIndex((c) => c.key === item.key);
        }
        this.layers[index] = {
          ...this.layers[index],
          x1: item.x1 + this.moveX - this.startX,
          x2: item.x2 + this.moveX - this.startX,
          y1: item.y1 + this.moveY - this.startY,
          y2: item.y2 + this.moveY - this.startY,
        };
        this.layers[index].location = this.getCellLocation(
          "move",
          this.layers[index]
        );
      });
      this.isOpt = "move";
      this.draw();
    }
  }

  // 左侧相应
  resizeLeft() {
    this.c.style.cursor = "w-resize";
    if (
      this.mouseStatus === "down" &&
      this.tableStatus !== "lt-resize" &&
      this.tableStatus !== "lb-resize"
    ) {
      this.tableStatus = "left-resize";
      this.current.x1 =
        this.moveX > this.current.x2 - this.resize
          ? this.current.x2 - this.resize
          : this.moveX;
      if (this.current.type === "table") {
        let tr = [];
        let td = [...this.current.coord.td];
        this.current.coord.tr.forEach((r) => {
          tr.push({
            x1:
              this.moveX > td[1].x1 - this.resize
                ? td[1].x1 - this.resize
                : this.moveX,
            y1: r.y1,
            x2: r.x2,
            y2: r.y2,
          });
        });

        td[0].x1 =
          this.moveX > td[1].x1 - this.resize
            ? td[1].x1 - this.resize
            : this.moveX;
        td[0].x2 =
          this.moveX > td[1].x1 - this.resize
            ? td[1].x1 - this.resize
            : this.moveX;
        this.current.coord = {
          tr,
          td,
        };
      }
      this.dealData();
    }
  }
  // 右侧相应
  resizeRight() {
    this.c.style.cursor = "e-resize";
    if (
      this.mouseStatus === "down" &&
      this.tableStatus !== "rt-resize" &&
      this.tableStatus !== "rb-resize"
    ) {
      this.tableStatus = "right-resize";
      this.current.x2 =
        this.moveX < this.current.x1 + this.resize
          ? this.current.x1 + this.resize
          : this.moveX;
      if (this.current.type === "table") {
        let tr = [],
          td = [];
        td = [...this.current.coord.td];
        this.current.coord.tr.forEach((r) => {
          tr.push({
            x1: r.x1,
            y1: r.y1,
            x2:
              this.moveX > td[td.length - 2].x2 + this.resize
                ? this.moveX
                : td[td.length - 2].x2 + this.resize,
            y2: r.y2,
          });
        });

        td[td.length - 1].x1 =
          this.moveX > td[td.length - 2].x2 + this.resize
            ? this.moveX
            : td[td.length - 2].x1 + this.resize;
        td[td.length - 1].x2 =
          this.moveX > td[td.length - 2].x2 + this.resize
            ? this.moveX
            : td[td.length - 2].x1 + this.resize;
        this.current.coord = {
          tr,
          td,
        };
      }
      this.dealData();
    }
  }
  // 顶部相应
  resizeTop() {
    this.c.style.cursor = "n-resize";
    if (
      this.mouseStatus === "down" &&
      this.tableStatus !== "lt-resize" &&
      this.tableStatus !== "rt-resize"
    ) {
      this.tableStatus = "top-resize";
      this.current.y1 =
        this.moveY > this.current.y2 - this.resize
          ? this.current.y2 - this.resize
          : this.moveY;
      if (this.current.type === "table") {
        let tr = [],
          td = [];
        tr = [...this.current.coord.tr];
        this.current.coord.td.forEach((r) => {
          td.push({
            x1: r.x1,
            y1:
              this.moveY > tr[1].y1 - this.resize
                ? tr[1].y1 - this.resize
                : this.moveY,
            x2: r.x2,
            y2: r.y2,
          });
        });

        tr[0].y1 =
          this.moveY > tr[1].y1 - this.resize
            ? tr[1].y1 - this.resize
            : this.moveY;
        tr[0].y2 =
          this.moveY > tr[1].y1 - this.resize
            ? tr[1].y1 - this.resize
            : this.moveY;
        this.current.coord = {
          tr,
          td,
        };
      }
      this.dealData();
    }
  }
  // 底部响应
  resizeBottom() {
    this.c.style.cursor = "s-resize";
    if (
      this.mouseStatus === "down" &&
      this.tableStatus !== "lb-resize" &&
      this.tableStatus !== "rb-resize"
    ) {
      this.tableStatus = "bottom-resize";
      this.current.y2 =
        this.moveY < this.current.y1 + this.resize
          ? this.current.y1 + this.resize
          : this.moveY;
      if (this.current.type === "table") {
        let tr = [],
          td = [];
        tr = [...this.current.coord.tr];
        this.current.coord.td.forEach((r) => {
          td.push({
            x1: r.x1,
            y1: r.y1,
            x2: r.x2,
            y2:
              this.moveY > tr[tr.length - 2].y2 + this.resize
                ? this.moveY
                : tr[tr.length - 2].y2 + this.resize,
          });
        });
        tr[tr.length - 1].y1 =
          this.moveY > tr[tr.length - 2].y2 + this.resize
            ? this.moveY
            : tr[tr.length - 2].y2 + this.resize;
        tr[tr.length - 1].y2 =
          this.moveY > tr[tr.length - 2].y2 + this.resize
            ? this.moveY
            : tr[tr.length - 2].y2 + this.resize;
        this.current.coord = {
          tr,
          td,
        };
      }
      this.dealData();
    }
  }

  // 响应左上
  resizeLT() {
    this.c.style.cursor = "nw-resize";
    if (this.mouseStatus === "down") {
      this.tableStatus = "lt-resize";
      const h = this.moveY - this.current.y1;
      this.current.x1 = this.moveX;
      this.current.y1 = this.moveY;
      if (this.current.type === "table") {
        let tr = [],
          td = [];
        this.current.coord.tr.forEach((r) => {
          tr.push({
            x1:
              this.moveX > this.current.coord.td[1].x1 - this.resize
                ? this.current.coord.td[1].x1 - this.resize
                : this.moveX,
            y1: r.y1,
            x2: r.x2,
            y2: r.y2,
          });
        });

        tr[0].y1 += h;
        tr[0].y2 += h;

        this.current.coord.td.forEach((d) => {
          td.push({
            x1: d.x1,
            y1: d.y1 + h,
            x2: d.x2,
            y2: d.y2,
          });
        });
        td[0].x1 =
          this.moveX > td[1].x1 - this.resize
            ? td[1].x1 - this.resize
            : this.moveX;
        td[0].x2 =
          this.moveX > td[1].x1 - this.resize
            ? td[1].x1 - this.resize
            : this.moveX;
        this.current.coord = {
          tr,
          td,
        };
      }
      this.dealData();
    }
  }
  // 响应右上
  resizeRT() {
    this.c.style.cursor = "ne-resize";
    if (this.mouseStatus === "down") {
      this.tableStatus = "rt-resize";
      const h = this.moveY - this.current.y1;
      this.current.x2 = this.moveX;
      this.current.y1 = this.moveY;
      if (this.current.type === "table") {
        let tr = [],
          td = [];
        this.current.coord.tr.forEach((r) => {
          tr.push({
            x1: r.x1,
            y1: r.y1,
            x2: this.moveX,
            y2: r.y2,
          });
        });

        tr[0].y1 += h;
        tr[0].y2 += h;

        this.current.coord.td.forEach((d) => {
          td.push({
            x1: d.x1,
            y1: d.y1 + h,
            x2: d.x2,
            y2: d.y2,
          });
        });
        td[td.length - 1].x1 = this.moveX;
        td[td.length - 1].x2 = this.moveX;
        this.current.coord = {
          tr,
          td,
        };
      }
      this.dealData();
    }
  }

  // 响应左下
  resizeBL() {
    this.c.style.cursor = "sw-resize";
    if (this.mouseStatus === "down") {
      this.tableStatus = "lb-resize";
      const h = this.moveY - this.current.y2;
      this.current.x1 = this.moveX;
      this.current.y2 = this.moveY;
      if (this.current.type === "table") {
        let tr = [],
          td = [];
        this.current.coord.tr.forEach((r) => {
          tr.push({
            x1: this.moveX,
            y1: r.y1,
            x2: r.x2,
            y2: r.y2,
          });
        });

        tr[tr.length - 1].y1 += h;
        tr[tr.length - 1].y2 += h;

        this.current.coord.td.forEach((d) => {
          td.push({
            x1: d.x1,
            y1: d.y1,
            x2: d.x2,
            y2: d.y2 + h,
          });
        });
        td[0].x1 = this.moveX;
        td[0].x2 = this.moveX;
        this.current.coord = {
          tr,
          td,
        };
      }
      this.dealData();
    }
  }

  // 响应右下
  resizeBR() {
    this.c.style.cursor = "se-resize";
    if (this.mouseStatus === "down") {
      this.tableStatus = "rb-resize";
      const h = this.moveY - this.current.y2;
      this.current.x2 = this.moveX;
      this.current.y2 = this.moveY;
      if (this.current.type === "table") {
        let tr = [],
          td = [];
        this.current.coord.tr.forEach((r) => {
          tr.push({
            x1: r.x1,
            y1: r.y1,
            x2: this.moveX,
            y2: r.y2,
          });
        });

        tr[tr.length - 1].y1 += h;
        tr[tr.length - 1].y2 += h;

        this.current.coord.td.forEach((d) => {
          td.push({
            x1: d.x1,
            y1: d.y1,
            x2: d.x2,
            y2: d.y2 + h,
          });
        });
        td[td.length - 1].x1 = this.moveX;
        td[td.length - 1].x2 = this.moveX;
        this.current.coord = {
          tr,
          td,
        };
      }
      this.dealData();
    }
  }

  // 响应表格里面的单元格线条
  resizeTableLine(match) {
    let td = [...this.current.coord.td];
    let tr = [...this.current.coord.tr];
    this.tableStatus = "table-resize";
    if (match.type === "td") {
      const obj = Object.assign({}, td[match.index]);
      let minx = td[match.index - 1].x1 + 3 * this.resize;
      let max = td[match.index + 1].x1 - 3 * this.resize;
      td[match.index] = {
        ...obj,
        x1: this.moveX < minx ? minx : this.moveX > max ? max : this.moveX,
        x2: this.moveX < minx ? minx : this.moveX > max ? max : this.moveX,
      };
    } else {
      const obj = Object.assign({}, tr[match.index]);
      let minx = tr[match.index - 1].y1 + 3 * this.resize;
      let max = tr[match.index + 1].y1 - 3 * this.resize;
      tr[match.index] = {
        ...obj,
        y1: this.moveY < minx ? minx : this.moveY > max ? max : this.moveY,
        y2: this.moveY < minx ? minx : this.moveY > max ? max : this.moveY,
      };
    }
    this.current.coord = {
      td,
      tr,
    };
    this.dealData();
  }

  // 拖拽之后重新赋值数据
  dealData(str) {
    this.isOpt = str || "resize"; //标记历史记录，撤销使用
    this.current.location = this.getCellLocation("move", this.current);
    if (this.current.type === "table") {
      this.current.coordLocation = this.getTableLocation("move", this.current);
    }
    let index = 0;
    if (this.current.index) {
      index = this.current.index;
    } else {
      index = this.layers.findIndex((item) => item.key === this.current.key);
    }
    this.layers[index] = this.current;
    this.draw();
  }

  // 重新计算单元格的location
  getCellLocation(str, item) {
    let imgleft = 0;
    let imgtop = 0;
    if (this.layers[0].type === "iamge") {
      imgleft = this.layers[0].x1;
      imgtop = this.layers[0].y1;
    }
    let x1 =
      ((str === "draw" ? this.startX : item.x1) - imgleft) / this.imgRate;
    let y1 = ((str === "draw" ? this.startY : item.y1) - imgtop) / this.imgRate;
    let x2 = ((str === "draw" ? this.moveX : item.x2) - imgleft) / this.imgRate;
    let y2 = ((str === "draw" ? this.moveY : item.y2) - imgtop) / this.imgRate;
    return [
      [x1, y1],
      [x2, y1],
      [x1, y2],
      [x2, y2],
    ];
  }

  // 重新计算表格的location否则放大缩小，坐标会失效
  getTableLocation(str, item) {
    let imgleft = 0;
    let imgtop = 0;
    if (this.layers[0].type === "iamge") {
      imgleft = this.layers[0].x1;
      imgtop = this.layers[0].y1;
    }
    let td = [],
      tr = [];
    let c = str === "draw" ? this.coord : item.coord;
    c.tr.forEach((r) => {
      tr.push({
        x1: (r.x1 - imgleft) / this.imgRate,
        y1: (r.y1 - imgtop) / this.imgRate,
        x2: (r.x2 - imgleft) / this.imgRate,
        y2: (r.y2 - imgtop) / this.imgRate,
      });
    });

    c.td.forEach((d) => {
      td.push({
        x1: (d.x1 - imgleft) / this.imgRate,
        y1: (d.y1 - imgtop) / this.imgRate,
        x2: (d.x2 - imgleft) / this.imgRate,
        y2: (d.y2 - imgtop) / this.imgRate,
      });
    });
    return {
      tr,
      td,
    };
  }

  // 撤销
  revoke() {
    if (this.history.length >= 1) {
      let info = this.history.pop();
      if (info.type === "move" || info.type === "resize") {
        if (info.selectOpt) {
          // 批量操作
          this.layers.forEach((item, index) => {
            info.originData.forEach((c) => {
              if (c.key === item.key) {
                this.layers[index] = c;
              }
            });
          });
          // this.removeSelect()
        } else {
          let index = this.layers.findIndex(
            (item) => item.key === info.data.key
          );
          this.layers[index] = info.originData;
        }
      } else if (info.type === "delete") {
        if (info.selectOpt) {
          // 批量操作
          this.layers = this.layers.concat(info.originData);
        } else {
          this.layers.push(info.originData);
        }
      } else if (info.type === "draw") {
        // 画table,需要进行批量操作
        if (info.data instanceof Array) {
          let arr = [];
          this.layers.forEach((item) => {
            let ismatch = false;
            info.data.forEach((c) => {
              if (item.key === c.key) {
                ismatch = true;
              }
            });
            if (!ismatch) {
              arr.push(item);
            }
          });
          this.layers = [...arr];
          info.originData = [...info.data];
        } else {
          let index = this.layers.findIndex(
            (item) => item.key === info.data.key
          );
          info.originData = this.layers[index];
          this.layers.splice(index, 1);
        }
      }
      this.deleteHistory.push(info);
      this.draw();
    }
  }

  // 反撤销
  reRevoke() {
    if (this.deleteHistory.length > 0) {
      let info = this.deleteHistory.pop();
      if (info.type === "move" || info.type === "resize") {
        if (info.selectOpt) {
          // 批量操作
          this.layers.forEach((item, index) => {
            info.data.forEach((c) => {
              if (c.key === item.key) {
                this.layers[index] = c;
              }
            });
          });
          // this.removeSelect()
        } else {
          let index = this.layers.findIndex(
            (item) => item.key === info.data.key
          );
          this.layers[index] = {
            ...info.data,
          };
        }
      } else if (info.type === "delete") {
        if (info.selectOpt) {
          // 批量操作
          // this.layers = this.layers.concat(info.data)
          let arr = [];
          this.layers.forEach((item) => {
            let isMatch = false;
            info.originData.forEach((c) => {
              if (c.key === item.key) {
                isMatch = true;
              }
            });
            if (!isMatch) {
              arr.push(item);
            }
          });
          this.layers = arr;
        } else {
          let index = this.layers.findIndex(
            (item) => item.key === info.originData.key
          );
          this.layers.splice(index, 1);
        }
      } else if (info.type === "draw") {
        if (info.originData instanceof Array) {
          this.layers = this.layers.concat(info.originData);
        } else {
          this.layers.push(info.originData);
        }
      }
      this.history.push(info);
      this.draw();
    }
  }

  // 删除，撤销，以及反撤销逻辑
  delete() {
    if (this.current) {
      if (this.current.type === "select") {
        let arr = [];
        let notArr = [];
        this.layers.forEach((item) => {
          let ismatch = false;
          this.currentArray.forEach((c) => {
            if (item.key === c.key) {
              ismatch = true;
            }
          });
          if (ismatch) {
            notArr.push(item);
          } else {
            arr.push(item);
          }
        });
        this.history.push({
          type: "delete",
          selectOpt: true, //批量操作
          data: "",
          originData: [...notArr],
        });
        this.layers = arr;
        // this.removeSelect()
      } else {
        this.history.push({
          type: "delete",
          data: "",
          originData: this.current,
        });
        let index = this.layers.findIndex(
          (item) => item.key === this.current.key
        );
        this.layers.splice(index, 1);
      }
      this.noUpdate = this.checkIsSave();
      this.current = null;
      this.draw();
      this.c.style.cursor = "default";
    } else if (this.currentArray.length > 0) {
      let arr = [];
      let notArr = [];
      this.layers.forEach((item) => {
        let index = this.currentArray.findIndex((c) => c.key === item.key);
        if (index === -1) {
          arr.push(item);
        } else {
          notArr.push(item);
        }
      });
      // 这里使用currentArray可能不准
      //  数据以layout为准
      this.history.push({
        type: "delete",
        selectOpt: true, //批量操作
        data: [],
        originData: [...notArr],
      });
      this.layers = [...arr];
      this.currentArray = [];
      this.noUpdate = this.checkIsSave();
      this.draw();
      this.c.style.cursor = "default";
    }
  }

  removeSelect() {
    var index = this.layers.findIndex((item) => item.type === "select");
    if (index !== -1) {
      this.layers.splice(index, 1);
    }
    // this.current = null
  }

  // 对坐标进行转换
  fixPosition(position) {
    if (position.x1 > position.x2) {
      let x = position.x1;
      position.x1 = position.x2;
      position.x2 = x;
    }
    if (position.y1 > position.y2) {
      let y = position.y1;
      position.y1 = position.y2;
      position.y2 = y;
    }
    // 限制框最小的长度,并未做限制
    return position;
  }

  // 款选
  findSelectArray(result) {
    this.currentArray = [];
    this.layers.forEach((item) => {
      if (
        item.x1 >= result.x1 &&
        item.x2 <= result.x2 &&
        item.y1 >= result.y1 &&
        item.y2 <= result.y2 &&
        item.type !== "select" &&
        item.type !== "img"
      ) {
        this.currentArray.push({
          ...item,
        });
      }
    });
  }

  // 保存并计算坐标
  saveDraw(str = "") {
    let useArr = []; // 有效数据
    let offsetLeft = 0;
    let offsetTop = 0;
    if (this.layers[0].type === "iamge") {
      offsetLeft = this.layers[0].x1;
      offsetTop = this.layers[0].y1;
    }

    let groupArr = {};
    // 1.先把table都转化为单元格,并且排除图片以及选框
    this.layers.forEach((item) => {
      if (item.type === "cell") {
        let x1 = parseInt((item.x1 - offsetLeft) / this.imgRate);
        let y1 = parseInt((item.y1 - offsetTop) / this.imgRate);
        let x2 = parseInt((item.x2 - offsetLeft) / this.imgRate);
        let y2 = parseInt((item.y2 - offsetTop) / this.imgRate);
        // 自定义格式
        useArr.push({
          ...item,
          location: [
            [x1, y1],
            [x2, y1],
            [x2, y2],
            [x1, y2],
          ],
          x1,
          y1,
          x2,
          y2,
        });
      } else if (item.type === "table") {
        let arr = this.transTable(item, offsetLeft, offsetTop);
        useArr.push(...arr);
      }
    });
    // 2.根据y轴排序，然后根据y轴进行分组
    useArr.sort((a, b) => Number(a.y1) - Number(b.y1));
    for (let i = 0; i < useArr.length; i++) {
      if (groupArr[useArr[i].y1]) {
        groupArr[useArr[i].y1].push(useArr[i]);
      } else {
        groupArr[useArr[i].y1] = [useArr[i]];
      }
    }
    // 3.对y轴分组数据再进行x轴排序
    let data = [];
    let group = Object.keys(groupArr);
    group
      .sort((a, b) => a - b)
      .forEach((key) => {
        let arr = groupArr[key];
        arr.sort((a, b) => a.x1 - b.x1);
        data.push(...arr);
      });
    // 真保存
    if (!str) {
      this.saveCurrent = [...data];
      this.history = [];
      this.deleteHistory = [];
      this.current = null;
      this.noUpdate = true;
    }

    return data;
  }

  // 对table坐标进行转换
  transTable(item, lf, tp) {
    let td = item.coord.td;
    let tr = item.coord.tr;
    let arr = [];
    for (let i = 0; i < item.w; i++) {
      for (let j = 0; j < item.h; j++) {
        let x1 = parseInt((td[i].x1 - lf) / this.imgRate);
        let y1 = parseInt((tr[j].y1 - tp) / this.imgRate);
        let x2 = parseInt((td[i + 1].x1 - lf) / this.imgRate);
        let y2 = parseInt((tr[j + 1].y1 - tp) / this.imgRate);
        arr.push({
          ...item,
          location: [
            [x1, y1],
            [x2, y1],
            [x2, y2],
            [x1, y2],
          ],
          x1,
          y1,
          x2,
          y2,
        });
      }
    }
    return arr;
  }

  // 切换模式
  // config 只有在draw中才生效，默认为单元格
  setMode(
    str,
    config = {
      type: "cell",
      tr: 1,
      td: 1,
    }
  ) {
    this.mode = str || "select";
    if (str === "draw") {
      this.c.style.cursor = "crosshair";
      this.drawType = config;
      this.current = null;
      this.currentArray = [];
    } else {
      this.draw.drawType = {};
      if (str === "drawSelect") {
        this.c.style.cursor = "crosshair";
        this.current = null;
        this.currentArray = [];
      }
    }
    this.draw();
  }

  // 切换图片以及数据
  resetConfig(config) {
    this.config = Object.assign(this.config, config);
    this.layers = [];
    this.current = null;
    this.imgRate = 1;
    this.history = [];
    this.noUpdate = true;
    this.deleteHistory = [];
    this.currentArray = [];
    this.saveCurrent = [];
    this.c.width = document.body.clientWidth;
    this.c.height = document.body.clientHeight - 64;
    this.mode = "select";
    if (this.config.url) {
      this.drawImage();
    } else {
      this.drawOriginData();
    }
  }

  // 判断是否需要保存
  checkIsSave() {
    let result = true;
    const list = this.saveDraw("check");
    if (this.saveCurrent.length === list.length) {
      for (let i = 0; i < this.saveCurrent.length; i++) {
        if (
          this.saveCurrent[i].x1 !== list[i].x1 ||
          this.saveCurrent[i].x2 !== list[i].x2 ||
          this.saveCurrent[i].y1 !== list[i].y1 ||
          this.saveCurrent[i].y2 !== list[i].y2
        ) {
          result = false;
        }
      }
    } else {
      result = false;
    }
    return result;
  }
}

// 单粒模式，获取类实例
function getInstance() {
  let D = null;
  return (config, modeChange) => {
    if (!D) {
      D = new DrawCanvas(config, modeChange);
    } else {
      D.resetConfig({});
    }
    return D;
  };
}

// 1.框选对table的作用以及操作
// 2.反撤销操作
// 3.坐标计算
export default getInstance();
