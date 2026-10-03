"""Chrome/PDFium regression: pip install pypdfium2; run after direct PDF smoke."""
import re
import sys
import pypdfium2 as pdfium

phrase = "कः धातुः मूलरूपेण परस्मैपदी अस्ति परन्तु वि-उपसर्गस्य योगे केवलम् आत्मनेपदप्रत्ययन् एव स्वीकरोति ?"
with pdfium.PdfDocument(sys.argv[1]) as doc:
    assert len(doc) == 1
    text = doc[0].get_textpage().get_text_range()
    normalized = re.sub(r"\s+", " ", text).strip()
    assert phrase in normalized, "Chrome copy lost or reordered source characters"
    assert "\u200b" not in text, "Old invisible glyph mappings leaked into copy"
    assert "\0" not in text, "Missing character in copied text"
print("PASS: complete Sanskrit sentence copies intact with Chrome's PDFium engine")
