import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import "./App.css";
import { Stage, Layer, Text, Image, Group, Rect, Line } from "react-konva";
import { throttle } from "lodash";
import useImage from "use-image";
import { writeImage, readImage } from '@tauri-apps/plugin-clipboard-manager';
import { Image as TauriImage } from "@tauri-apps/api/image";
import { save } from '@tauri-apps/plugin-dialog';

function App() {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const [selectionStart, setSelectionStart] = useState({ x: 0, y: 0 });
  const [selectionEnd, setSelectionEnd] = useState({ x: 0, y: 0 });
  const [showPreview, setShowPreview] = useState(true);

  const capsview = useRef(throttle(async (x: number, y: number) => {
    try {
      // 更新鼠标位置状态
      setMousePosition({ x, y });

      // 调用Rust命令获取截图数据
      const result: Uint8Array = await invoke("xcap_start", { x, y });
      const blob = new Blob([new Uint8Array(result).buffer], { type: "image/png" });
      setImagePath(URL.createObjectURL(blob));
      console.log("截图成功获取");
    } catch (error) {
      console.error("截图失败:", error);
    }
  }, 30)).current; // 限制为每30ms最多执行一次

  // 使用 use-image hook 加载图像
  const [image] = useImage(imagePath || "");

  // 页面加载后将窗口最大化
  useEffect(() => {
    const maximizeWindow = async () => {
      const currentWindow = getCurrentWebviewWindow();
      await currentWindow.maximize();
    
    };

    maximizeWindow();
  }, []);

  // 计算选区坐标
  const selectionRect = {
    x: Math.min(selectionStart.x, selectionEnd.x),
    y: Math.min(selectionStart.y, selectionEnd.y),
    width: Math.abs(selectionEnd.x - selectionStart.x),
    height: Math.abs(selectionEnd.y - selectionStart.y)
  };

  // 处理鼠标按下事件
  const handleMouseDown = (e: any) => {
    const pos = e.target.getStage().getPointerPosition();
    if (pos) {
      setIsSelecting(true);
      setSelectionStart({ x: pos.x, y: pos.y });
      setSelectionEnd({ x: pos.x, y: pos.y });
    }
  };

  // 处理鼠标移动事件
  const handleMouseMove = (e: any) => {
    const pos = e.target.getStage().getPointerPosition();
    if (pos) {
      // 更新鼠标位置和放大镜预览
      capsview(pos.x, pos.y);

      // 如果正在选择区域，则更新结束点
      if (isSelecting) {
        setSelectionEnd({ x: pos.x, y: pos.y });
      }
    }
  };

  // 处理鼠标释放事件
  const handleMouseUp = () => {
    if (isSelecting) {
      setIsSelecting(false);
      setHasSelection(true);
      setShowPreview(false); // 关闭预览功能
      // 这里可以添加处理选区完成后的逻辑
      console.log("选区完成:", selectionRect);
    }
  };

  // 取消选择
  const handleCancelSelection = async () => {
    setHasSelection(false);
    setShowPreview(true);
    setSelectionStart({ x: 0, y: 0 });
    setSelectionEnd({ x: 0, y: 0 });
    // 仅关闭窗口而不是退出程序
    try {
      const currentWindow = getCurrentWebviewWindow();
      await currentWindow.hide();
    } catch (error) {
      console.error("关闭窗口时出错:", error);
    }
  };

  // 确认选择
  const handleConfirmSelection = async () => {
    // 这里可以添加确认选区后的处理逻辑
    console.log("确认选区:", selectionRect);
    
    const path = await save({
      filters: [
        {
          name: 'screenshot',
          extensions: ['png', 'jpeg'],
        },
      ],
    });
    
    try {

      await invoke("capture", {
        x: selectionRect.x,
        y: selectionRect.y,
        width: selectionRect.width,
        height: selectionRect.height,
        savePath: path,
      });

      const currentWindow = getCurrentWebviewWindow();
      await currentWindow.close();
    } catch (error) {
      console.error("关闭窗口时出错:", error);
    }
  };

  const handleCopyToClipboard = async () => {
    try {
      


      try {
      const image: Uint8Array = await invoke("capture", {
        x: selectionRect.x,
        y: selectionRect.y,
        width: selectionRect.width,
        height: selectionRect.height
      });
        // 写入剪贴板
        const img_data = await TauriImage.new(image, selectionRect.width, selectionRect.height)
        await writeImage(img_data);
        // 关闭窗口
        const currentWindow = getCurrentWebviewWindow();
        await currentWindow.close();

        alert("已复制到剪贴板");
      } catch (clipboardError: any) {
        console.error("复制到剪贴板失败:", clipboardError);
        alert("复制到剪贴板失败: " + clipboardError.message);
        // 即使复制失败也关闭窗口
        const currentWindow = getCurrentWebviewWindow();
        // await currentWindow.close();
      }
    } catch (error) {
      console.error("截图失败:", error);
      // 添加用户友好的错误提示
      alert("复制到剪贴板时出错，请重试");
    }
  }


  return (
    <main className="container">
      <Stage
        width={window.innerWidth}
        height={window.innerHeight}
        onMouseDown={handleMouseDown}
        onMousemove={handleMouseMove}
        onMouseup={handleMouseUp}
      >
        {/* 背景遮罩层 */}
        <Layer>
          {/* 使用遮罩技术实现真正的透明选区 */}
          {isSelecting || hasSelection ? (
            <>
              {/* 定义一个组，使用选区作为遮罩，只显示选区外的半透明遮罩 */}
              <Group
                clipFunc={(ctx) => {
                  // 先绘制整个屏幕区域
                  ctx.rect(0, 0, window.innerWidth, window.innerHeight);
                  // 然后逆时针绘制选区区域，形成一个"洞"
                  ctx.rect(
                    selectionRect.x,
                    selectionRect.y,
                    selectionRect.width,
                    selectionRect.height
                  );
                  ctx.clip('evenodd');
                }}
              >
                <Rect
                  x={0}
                  y={0}
                  width={window.innerWidth}
                  height={window.innerHeight}
                  fill="black"
                  opacity={0.5}
                />
              </Group>

              {/* 选区边框 */}
              <Rect
                x={selectionRect.x}
                y={selectionRect.y}
                width={selectionRect.width}
                height={selectionRect.height}
                stroke="white"
                strokeWidth={1}
                dash={[5, 5]}
                listening={false}
              />
            </>
          ) : (
            // 没有选区时显示全屏半透明遮罩
            <Rect
              x={0}
              y={0}
              width={window.innerWidth}
              height={window.innerHeight}
              fill="black"
              opacity={0.5}
            />
          )}

          {image && showPreview && (
            <Group x={mousePosition.x + 10} y={mousePosition.y + 10}>
              {/* 半透明背景 */}
              <Rect width={200} height={240} fill="black" opacity={0.8} />

              {/* 十字星瞄准器 - 水平线 */}
              <Line
                points={[0, 100, 200, 100]}
                stroke="red"
                strokeWidth={1}
              />

              {/* 十字星瞄准器 - 垂直线 */}
              <Line
                points={[100, 0, 100, 200]}
                stroke="red"
                strokeWidth={1}
              />

              {/* 截图预览图像 */}
              <Image
                x={0}
                y={0}
                width={200}
                height={200}
                image={image}
              />

              {/* 坐标文本 */}
              <Text
                x={10}
                y={210}
                text={`坐标: (${mousePosition.x}, ${mousePosition.y})`}
                fontSize={14}
                fill="white"
              />
            </Group>
          )}
        </Layer>

        {/* 坐标显示层 */}
        <Layer>
          <Text text={`鼠标位置: (${mousePosition.x}, ${mousePosition.y})`} fontSize={15} x={20} y={20} fill="white" />
          <Text text="按住鼠标左键拖动以选择截图区域" fontSize={15} x={20} y={40} fill="white" />
        </Layer>
      </Stage>

      {/* 操作按钮 */}
      {hasSelection && (
        <div
          className="absolute bg-gray-400 rounded flex justify-end p-2 gap-4"
          style={{
            left: `${selectionRect.x + selectionRect.width / 2 - 100}px`,
            top: `${selectionRect.y + selectionRect.height + 10}px`,
            width: `${selectionRect.width}`,

          }}
        >
          <button
            onClick={handleCancelSelection}
            className="px-2 py-1 bg-red-500 text-white rounded hover:bg-gray-600 transition"
          >
            取消
          </button>
          <button
            onClick={handleCopyToClipboard}
            className="px-2 py-1 bg-gray-500 text-white rounded hover:bg-green-700 transition"
          >
            复制到剪贴板
          </button>
          <button
            onClick={handleConfirmSelection}
            className="px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition"
          >
            保存
          </button>
        </div>
      )}


    </main>
  );
}

export default App;