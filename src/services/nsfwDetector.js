/**
 * Service de détection de contenu NSFW via l'espace Hugging Face
 * Modèle : Freepik/nsfw_image_detector (Gradio Space : InspiratioNULL/nsfw_image_detector)
 */

const HF_SPACE_URL = 'https://inspirationull-nsfw-image-detector.hf.space';

/**
 * Analyse un buffer d'image et détermine si elle contient du contenu NSFW
 * @param {Buffer} imageBuffer - Données brutes de l'image
 * @param {string} [mimeType='image/jpeg']
 * @returns {Promise<{ isNsfw: boolean, details: string, scores: string }>}
 */
export async function checkImageNsfw(imageBuffer, mimeType = 'image/jpeg') {
  if (!imageBuffer || imageBuffer.length === 0) {
    return { isNsfw: false, details: 'Buffer vide', scores: '' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 secondes max

  try {
    // 1. Upload du fichier vers l'espace Gradio
    const formData = new FormData();
    const extension = mimeType.includes('png') ? 'png' : 'jpg';
    const blob = new Blob([imageBuffer], { type: mimeType });
    formData.append('files', blob, `scan_${Date.now()}.${extension}`);

    const uploadRes = await fetch(`${HF_SPACE_URL}/gradio_api/upload`, {
      method: 'POST',
      body: formData,
      signal: controller.signal
    });

    if (!uploadRes.ok) {
      throw new Error(`Upload Gradio HTTP ${uploadRes.status}`);
    }

    const uploadJson = await uploadRes.json();
    const uploadedFilePath = Array.isArray(uploadJson) ? uploadJson[0] : null;

    if (!uploadedFilePath) {
      throw new Error('Chemin de fichier Gradio non renvoyé');
    }

    // 2. Appel de la prédiction du modèle
    const callRes = await fetch(`${HF_SPACE_URL}/gradio_api/call/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: [
          { meta: { _type: 'gradio.FileData' }, path: uploadedFilePath },
          'medium'
        ]
      }),
      signal: controller.signal
    });

    if (!callRes.ok) {
      throw new Error(`Call Gradio HTTP ${callRes.status}`);
    }

    const callJson = await callRes.json();
    const eventId = callJson.event_id;

    if (!eventId) {
      throw new Error('Event ID non reçu de Gradio');
    }

    // 3. Récupération du résultat via SSE (Server-Sent Events)
    const eventRes = await fetch(`${HF_SPACE_URL}/gradio_api/call/predict/${eventId}`, {
      signal: controller.signal
    });

    if (!eventRes.ok) {
      throw new Error(`Stream Gradio HTTP ${eventRes.status}`);
    }

    const eventText = await eventRes.text();

    // Recherche de la ligne "data: [...]"
    const dataMatch = eventText.match(/data:\s*(\[[\s\S]*?\])\s*(\n|$)/);
    if (!dataMatch || !dataMatch[1]) {
      throw new Error('Réponse data Gradio non trouvée dans le flux');
    }

    const parsedData = JSON.parse(dataMatch[1]);
    const scoresStr = parsedData[0] || '';
    const classificationStr = parsedData[1] || '';

    // "🔴 True" indique que l'image est NSFW
    const isNsfw = classificationStr.includes('🔴') || classificationStr.toLowerCase().includes('true');

    return {
      isNsfw,
      details: classificationStr.trim(),
      scores: scoresStr.trim()
    };
  } catch (err) {
    console.warn('[NSFW] Erreur ou timeout lors de l\'analyse de l\'image:', err.message);
    return {
      isNsfw: false,
      details: `Erreur analyse (${err.message})`,
      scores: ''
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
