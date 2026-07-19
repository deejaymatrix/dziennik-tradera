use std::path::Path;

use lopdf::content::{Content, Operation};
use lopdf::{dictionary, Document, Object, Stream};

use crate::error::AppError;

const PAGE_WIDTH: f32 = 595.0;
const PAGE_HEIGHT: f32 = 842.0;
const MARGIN: f32 = 40.0;
const TITLE_SIZE: f32 = 18.0;
const SUBTITLE_SIZE: f32 = 10.0;
const SUMMARY_SIZE: f32 = 11.0;
const TABLE_SIZE: f32 = 9.0;
const LINE_HEIGHT: f32 = 14.0;

pub struct PdfReportInput {
    pub title: String,
    pub subtitle: String,
    pub summary_lines: Vec<String>,
    pub table_headers: Vec<String>,
    pub table_rows: Vec<Vec<String>>,
}

/// Ucieka znaki specjalne w literale tekstowym PDF - `(`, `)` i `\` mają znaczenie
/// składniowe w `(...)  Tj`, więc bez tego dowolny tekst z tymi znakami zepsułby stream.
fn escape(text: &str) -> String {
    text.replace('\\', "\\\\")
        .replace('(', "\\(")
        .replace(')', "\\)")
}

fn text_op(font: &str, size: f32, x: f32, y: f32, text: &str) -> Vec<Operation> {
    vec![
        Operation::new("BT", vec![]),
        Operation::new("Tf", vec![font.into(), size.into()]),
        Operation::new("Td", vec![x.into(), y.into()]),
        Operation::new("Tj", vec![Object::string_literal(escape(text))]),
        Operation::new("ET", vec![]),
    ]
}

fn line_op(x1: f32, y1: f32, x2: f32, y2: f32) -> Vec<Operation> {
    vec![
        Operation::new("m", vec![x1.into(), y1.into()]),
        Operation::new("l", vec![x2.into(), y2.into()]),
        Operation::new("S", vec![]),
    ]
}

fn column_x_positions(headers_len: usize) -> Vec<f32> {
    let usable = PAGE_WIDTH - 2.0 * MARGIN;
    let col_width = usable / headers_len as f32;
    (0..headers_len)
        .map(|i| MARGIN + i as f32 * col_width)
        .collect()
}

fn render_table_row(
    ops: &mut Vec<Operation>,
    font: &str,
    size: f32,
    columns: &[f32],
    y: f32,
    values: &[String],
) {
    for (col_x, value) in columns.iter().zip(values.iter()) {
        ops.extend(text_op(font, size, *col_x, y, value));
    }
}

/// Generuje kompaktowy raport PDF (tytuł, linie podsumowania, tabela) korzystając wyłącznie
/// ze standardowych 14 fontów PDF (Helvetica / Helvetica-Bold) - bez osadzania plików
/// fontów. Dzieli dane tabeli na tyle stron, ile potrzeba.
pub fn generate(input: &PdfReportInput, destination: &Path) -> Result<(), AppError> {
    let mut doc = Document::with_version("1.5");

    let font_regular = doc.add_object(dictionary! {
        "Type" => "Font",
        "Subtype" => "Type1",
        "BaseFont" => "Helvetica",
    });
    let font_bold = doc.add_object(dictionary! {
        "Type" => "Font",
        "Subtype" => "Type1",
        "BaseFont" => "Helvetica-Bold",
    });
    let resources_id = doc.add_object(dictionary! {
        "Font" => dictionary! {
            "F1" => font_regular,
            "F2" => font_bold,
        },
    });

    let columns = column_x_positions(input.table_headers.len());

    let header_reserved = TITLE_SIZE
        + LINE_HEIGHT
        + input.summary_lines.len() as f32 * LINE_HEIGHT
        + LINE_HEIGHT * 2.0;
    let rows_per_first_page =
        (((PAGE_HEIGHT - 2.0 * MARGIN - header_reserved) / LINE_HEIGHT).floor() as usize).max(1);
    let rows_per_other_page =
        (((PAGE_HEIGHT - 2.0 * MARGIN - LINE_HEIGHT * 2.0) / LINE_HEIGHT).floor() as usize).max(1);

    let mut page_chunks: Vec<&[Vec<String>]> = Vec::new();
    let mut remaining: &[Vec<String>] = input.table_rows.as_slice();
    let first_take = remaining.len().min(rows_per_first_page);
    let (first_chunk, rest) = remaining.split_at(first_take);
    page_chunks.push(first_chunk);
    remaining = rest;
    while !remaining.is_empty() {
        let take = remaining.len().min(rows_per_other_page);
        let (chunk, rest) = remaining.split_at(take);
        page_chunks.push(chunk);
        remaining = rest;
    }

    let mut page_ids = Vec::new();
    for (page_index, rows) in page_chunks.iter().enumerate() {
        let mut ops: Vec<Operation> = Vec::new();
        let mut y = PAGE_HEIGHT - MARGIN;

        if page_index == 0 {
            ops.extend(text_op("F2", TITLE_SIZE, MARGIN, y, &input.title));
            y -= LINE_HEIGHT * 1.5;
            ops.extend(text_op("F1", SUBTITLE_SIZE, MARGIN, y, &input.subtitle));
            y -= LINE_HEIGHT;
            for line in &input.summary_lines {
                ops.extend(text_op("F1", SUMMARY_SIZE, MARGIN, y, line));
                y -= LINE_HEIGHT;
            }
            y -= LINE_HEIGHT * 0.5;
        }

        render_table_row(
            &mut ops,
            "F2",
            TABLE_SIZE,
            &columns,
            y,
            &input.table_headers,
        );
        ops.extend(line_op(MARGIN, y - 4.0, PAGE_WIDTH - MARGIN, y - 4.0));
        y -= LINE_HEIGHT;

        for row in rows.iter() {
            render_table_row(&mut ops, "F1", TABLE_SIZE, &columns, y, row);
            y -= LINE_HEIGHT;
        }

        let content = Content { operations: ops };
        let content_bytes = content
            .encode()
            .map_err(|e| AppError::Io(format!("nie można zakodować strony PDF: {e}")))?;
        let content_id = doc.add_object(Stream::new(dictionary! {}, content_bytes));

        let page_id = doc.add_object(dictionary! {
            "Type" => "Page",
            "Contents" => content_id,
            "Resources" => resources_id,
            "MediaBox" => vec![0.into(), 0.into(), PAGE_WIDTH.into(), PAGE_HEIGHT.into()],
        });
        page_ids.push(page_id);
    }

    let pages_id = doc.add_object(dictionary! {
        "Type" => "Pages",
        "Kids" => page_ids.iter().map(|id| Object::Reference(*id)).collect::<Vec<_>>(),
        "Count" => page_ids.len() as i64,
    });
    for page_id in &page_ids {
        if let Ok(page_dict) = doc.get_object_mut(*page_id).and_then(|o| o.as_dict_mut()) {
            page_dict.set("Parent", pages_id);
        }
    }

    let catalog_id = doc.add_object(dictionary! {
        "Type" => "Catalog",
        "Pages" => pages_id,
    });
    doc.trailer.set("Root", catalog_id);
    doc.compress();
    doc.save(destination)
        .map_err(|e| AppError::Io(format!("nie można zapisać pliku PDF: {e}")))?;
    Ok(())
}
