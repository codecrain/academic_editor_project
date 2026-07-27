//! Contents/content.hpf — OPF 패키지 매니페스트
//!
//! `parser::hwpx::content`의 역방향. 한컴 호환을 위해 14개 네임스페이스와
//! 기본 metadata를 선언한다.

use std::io::Cursor;

use quick_xml::Writer;

use crate::model::document::DocumentMetadata;

use super::utils::{empty_tag, end_tag, start_tag_attrs, text, write_xml_decl};
use super::SerializeError;

/// BinData 엔트리 (manifest 등록용)
#[derive(Debug, Clone)]
pub struct BinDataEntry {
    pub id: String,
    pub href: String,
    pub media_type: String,
}

/// content.hpf XML 생성
pub fn write_content_hpf(
    section_hrefs: &[String],
    bin_data: &[BinDataEntry],
    metadata: &DocumentMetadata,
) -> Result<Vec<u8>, SerializeError> {
    let buf = Cursor::new(Vec::new());
    let mut w = Writer::new(buf);

    write_xml_decl(&mut w)?;

    // 한컴 HWPX 2011/2016 네임스페이스 + 표준 스키마
    start_tag_attrs(
        &mut w,
        "opf:package",
        &[
            ("xmlns:ha", "http://www.hancom.co.kr/hwpml/2011/app"),
            ("xmlns:hp", "http://www.hancom.co.kr/hwpml/2011/paragraph"),
            ("xmlns:hp10", "http://www.hancom.co.kr/hwpml/2016/paragraph"),
            ("xmlns:hs", "http://www.hancom.co.kr/hwpml/2011/section"),
            ("xmlns:hc", "http://www.hancom.co.kr/hwpml/2011/core"),
            ("xmlns:hh", "http://www.hancom.co.kr/hwpml/2011/head"),
            ("xmlns:hhs", "http://www.hancom.co.kr/hwpml/2011/history"),
            ("xmlns:hm", "http://www.hancom.co.kr/hwpml/2011/master-page"),
            ("xmlns:hpf", "http://www.hancom.co.kr/schema/2011/hpf"),
            ("xmlns:dc", "http://purl.org/dc/elements/1.1/"),
            ("xmlns:opf", "http://www.idpf.org/2007/opf/"),
            (
                "xmlns:ooxmlchart",
                "http://www.hancom.co.kr/hwpml/2016/ooxmlchart",
            ),
            ("xmlns:epub", "http://www.idpf.org/2007/ops"),
            (
                "xmlns:config",
                "urn:oasis:names:tc:opendocument:xmlns:config:1.0",
            ),
            ("version", ""),
            ("unique-identifier", ""),
            ("id", ""),
        ],
    )?;

    // <opf:metadata>
    start_tag_attrs(&mut w, "opf:metadata", &[])?;
    start_tag_attrs(&mut w, "opf:title", &[])?;
    text(&mut w, &metadata.title)?;
    end_tag(&mut w, "opf:title")?;
    start_tag_attrs(&mut w, "opf:language", &[])?;
    text(&mut w, "ko")?;
    end_tag(&mut w, "opf:language")?;
    start_tag_attrs(
        &mut w,
        "opf:meta",
        &[("name", "creator"), ("content", "text")],
    )?;
    text(&mut w, &metadata.author)?;
    end_tag(&mut w, "opf:meta")?;
    write_metadata_field(&mut w, "subject", &metadata.subject)?;
    write_metadata_field(&mut w, "keyword", &metadata.keywords)?;
    write_metadata_field(&mut w, "description", &metadata.description)?;
    empty_tag(
        &mut w,
        "opf:meta",
        &[("name", "CreatedDate"), ("content", "text")],
    )?;
    empty_tag(
        &mut w,
        "opf:meta",
        &[("name", "ModifiedDate"), ("content", "text")],
    )?;
    end_tag(&mut w, "opf:metadata")?;

    // <opf:manifest>
    start_tag_attrs(&mut w, "opf:manifest", &[])?;

    empty_tag(
        &mut w,
        "opf:item",
        &[
            ("id", "header"),
            ("href", "Contents/header.xml"),
            ("media-type", "application/xml"),
        ],
    )?;

    for (i, href) in section_hrefs.iter().enumerate() {
        let id = format!("section{}", i);
        empty_tag(
            &mut w,
            "opf:item",
            &[
                ("id", id.as_str()),
                ("href", href.as_str()),
                ("media-type", "application/xml"),
            ],
        )?;
    }

    // settings.xml 등록
    empty_tag(
        &mut w,
        "opf:item",
        &[
            ("id", "settings"),
            ("href", "settings.xml"),
            ("media-type", "application/xml"),
        ],
    )?;

    for entry in bin_data {
        empty_tag(
            &mut w,
            "opf:item",
            &[
                ("id", entry.id.as_str()),
                ("href", entry.href.as_str()),
                ("media-type", entry.media_type.as_str()),
                ("isEmbeded", "1"),
            ],
        )?;
    }

    end_tag(&mut w, "opf:manifest")?;

    // <opf:spine>
    start_tag_attrs(&mut w, "opf:spine", &[])?;
    empty_tag(&mut w, "opf:itemref", &[("idref", "header")])?;
    for i in 0..section_hrefs.len() {
        let id = format!("section{}", i);
        empty_tag(&mut w, "opf:itemref", &[("idref", id.as_str())])?;
    }
    end_tag(&mut w, "opf:spine")?;

    end_tag(&mut w, "opf:package")?;

    Ok(w.into_inner().into_inner())
}

fn write_metadata_field<W: std::io::Write>(
    writer: &mut Writer<W>,
    name: &str,
    value: &str,
) -> Result<(), SerializeError> {
    start_tag_attrs(writer, "opf:meta", &[("name", name), ("content", "text")])?;
    text(writer, value)?;
    end_tag(writer, "opf:meta")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::document::DocumentMetadata;

    #[test]
    fn write_content_hpf_serializes_public_metadata() {
        let metadata = DocumentMetadata {
            title: "2026년 안전 & 운영계획".to_string(),
            subject: "공공기관 <확정본>".to_string(),
            author: "데이터혁신처".to_string(),
            keywords: "안전, 예산".to_string(),
            description: "감사 대응용".to_string(),
        };

        let bytes = write_content_hpf(&[], &[], &metadata).unwrap();
        let xml = String::from_utf8(bytes).unwrap();
        assert!(xml.contains("2026년 안전 &amp; 운영계획"));
        assert!(xml.contains("공공기관 &lt;확정본&gt;"));
        assert!(xml.contains("name=\"creator\""));
        assert!(xml.contains(">데이터혁신처</opf:meta>"));
        assert!(xml.contains("name=\"keyword\""));
        assert!(xml.contains("name=\"description\""));
    }
}
