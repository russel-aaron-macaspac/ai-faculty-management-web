import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const apiKey = process.env.OCR_SPACE_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OCR service is not configured.' },
        { status: 500 }
      );
    }

    const incomingForm = await request.formData();
    const file = incomingForm.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: 'File is required under form field "file".' },
        { status: 400 }
      );
    }

    const upstreamForm = new FormData();
    upstreamForm.append('apikey', apiKey);
    upstreamForm.append('language', 'eng');
    upstreamForm.append('isOverlayRequired', 'false');
    upstreamForm.append('file', file, file.name);

    const upstreamResponse = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      body: upstreamForm,
    });

    const data = await upstreamResponse.json();

    if (!upstreamResponse.ok) {
      return NextResponse.json(
        { error: data?.ErrorMessage || 'OCR provider request failed.' },
        { status: 502 }
      );
    }

    if (data?.IsErroredOnProcessing) {
      const errorMessage = Array.isArray(data?.ErrorMessage)
        ? data.ErrorMessage.join(', ')
        : data?.ErrorMessage || 'OCR processing failed.';

      return NextResponse.json({ error: errorMessage }, { status: 422 });
    }

    const extractedText = data?.ParsedResults?.[0]?.ParsedText;
    if (!extractedText) {
      return NextResponse.json(
        { error: 'No extracted text returned by OCR provider.' },
        { status: 422 }
      );
    }

    return NextResponse.json({ text: extractedText });
  } catch (error) {
    console.error('[OCR API ERROR]', error);
    return NextResponse.json(
      { error: 'Unexpected OCR server error.' },
      { status: 500 }
    );
  }
}
