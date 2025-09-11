use image::{EncodableLayout, ImageEncoder};
use std::{
    io::{Cursor, Write},
    time::Instant,
};
use xcap::Monitor;

#[tauri::command]
fn xcap_start(x: u32, y: u32, width: Option<u32>, height: Option<u32>) -> Result<Vec<u8>, String> {
    xcap(x, y, width, height)
}

#[tauri::command]
fn capture(
    x: u32,
    y: u32,
    width: Option<u32>,
    height: Option<u32>,
    save_path: Option<String>,
) -> Result<Vec<u8>, String> {
    let data = xcap(x, y, width, height)?;
    if let Some(save_path) = save_path {
        let mut file = std::fs::File::create(save_path).map_err(|e| e.to_string())?;
        file.write_all(&data).map_err(|e| e.to_string())?;
    }

    Ok(data)
}

fn xcap(x: u32, y: u32, width: Option<u32>, height: Option<u32>) -> Result<Vec<u8>, String> {
    let monitors = Monitor::all().map_err(|e| e.to_string())?;

    let monitor = monitors
        .into_iter()
        .find(|m| m.is_primary().unwrap_or(false))
        .ok_or("未找到主显示器")?;

    let region_width = width.unwrap_or(100u32);
    let region_height = height.unwrap_or(100u32);
    let start = Instant::now();
    let image = monitor
        .capture_region(x, y, region_width, region_height)
        .map_err(|e| e.to_string())?;
    println!(
        "Time to record region of size {}x{}: {:?}",
        image.width(),
        image.height(),
        start.elapsed()
    );
    // 将图像数据转换为字节数组返回给前端
    let width = image.width();
    let height = image.height();
    let mut buffer = Cursor::new(Vec::new());
    let encoder = image::codecs::png::PngEncoder::new(&mut buffer);
    let rgba_image = image::DynamicImage::ImageRgba8(image).into_rgba8();
    encoder
        .write_image(
            rgba_image.as_bytes(),
            width,
            height,
            image::ExtendedColorType::Rgba8,
        )
        .map_err(|e| e.to_string())?;

    Ok(buffer.into_inner())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![capture, xcap_start])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|_app, event| match event {
            tauri::RunEvent::ExitRequested { api, .. } => {
                api.prevent_exit();
            }
            _ => {}
        });
}
