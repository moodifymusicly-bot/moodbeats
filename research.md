## Computer Vision–Driven Facial and Emotion Recognition for Mood‑Based Music Recommendation

### 1. Introduction

Human emotions are a primary driver of music preference. Modern recommendation engines increasingly exploit affective computing and computer vision (CV) to infer a user’s emotional state directly from their face and use that signal to steer recommendations. This document is a single, self‑contained research paper–style overview that:

- **Surveys** core concepts in computer vision–based facial and emotion recognition and their machine learning (ML) foundations.
- **Connects** those concepts to the concrete technologies used in this project (FastAPI backend, PyTorch hybrid recommender, Next.js frontend, in‑browser face analysis).
- **Explains the integration pipeline** from webcam frames to mood classification to music recommendation.
- **Provides citations** to recent surveys, benchmark papers, datasets, and toolkits, plus suggested image resources you can later embed.

The focus is on the end‑to‑end path: raw video → faces → emotions → discrete moods → personalized recommendations.

---

### 2. Background: Computer Vision for Faces and Emotions

#### 2.1 Facial analysis tasks

Computer vision models operate on images \(or video frames\) to solve a number of facial analysis tasks:

- **Face detection**: locate faces and return bounding boxes and confidence scores.
- **Face alignment**: normalize pose and geometry (e.g. eyes horizontal, fixed crop) to reduce variation.
- **Face representation / embedding**: map faces into a low‑dimensional feature space that preserves identity or affect.
- **Facial expression recognition (FER)**: classify facial expressions such as happiness, sadness, surprise, anger, fear, disgust, and neutrality.
- **Valence–arousal estimation**: regress continuous values \(valence: pleasant–unpleasant, arousal: excited–calm\) to represent affect in a 2D space.

This project primarily uses **FER** to infer a discrete emotion from the camera and then map that emotion into one of a few application‑specific moods (`happy`, `sad`, `gym`, `study`, `rock`).

#### 2.2 Evolution of emotion recognition methods

Early approaches used **hand‑crafted features** plus classical ML models:

- Geometric features from facial landmarks (distances, angles).
- Appearance features like Local Binary Patterns (LBP), Histogram of Oriented Gradients (HOG), Gabor filters.
- Classifiers such as SVMs, k‑NN, Random Forests.

Comprehensive older reviews include:

- Zeng et al., “A Survey of Affect Recognition Methods: Audio, Visual, and Spontaneous Expressions,” *IEEE Trans. PAMI*, 2009.

With the success of deep learning in vision, **convolutional neural networks (CNNs)** became the dominant paradigm for FER:

- Li and Deng, “Deep Facial Expression Recognition: A Survey,” *IEEE Trans. Affective Computing*, 2020. [IEEE Xplore](https://ieeexplore.ieee.org/document/9039580/)
- Tautkute et al., “A Comprehensive Survey on Deep Facial Expression Recognition: Challenges, Applications, and Future Guidelines,” 2022. [NTNU Open](https://ntnuopen.ntnu.no/ntnu-xmlui/handle/11250/3051732)
- Shan et al., “Facial Expression Recognition: A Review,” *Multimedia Tools and Applications*, 2023. [Springer](https://link.springer.com/article/10.1007/s11042-023-15982-x)

These surveys show that deep FER systems achieve superior robustness to illumination, pose, and identity variation compared to classical pipelines.

---

### 3. Deep Learning for Facial Emotion Recognition

#### 3.1 CNN‑based architectures

Most modern FER systems are built on CNN backbones:

- **Shallow custom CNNs** for smaller datasets (e.g. FER2013).
- **Transfer learning** from large‑scale image models (VGGNet, ResNet, EfficientNet) fine‑tuned on FER data.
- **Ensemble models** combining multiple CNN variants.

Examples:

- Mollah et al., “Convolutional Neural Network Algorithm Based Facial Emotion Recognition System for FER‑2013 Dataset,” 2022. [IEEE Xplore](https://ieeexplore.ieee.org/document/9988371/)
- Georgescu et al., “A Study on FER2013 with Deep Convolutional Neural Networks,” *arXiv:2105.03588* [arXiv](https://arxiv.org/abs/2105.03588)

CNNs excel at:

- Learning **spatially local filters** that capture eyes, mouth, brows, and their configurations.
- Performing **end‑to‑end training** where feature extraction and classification are optimized jointly using cross‑entropy loss.

#### 3.2 Temporal models and hybrids (CNN + RNN, 3D CNN, Transformers)

For video, emotions evolve over time. Hybrid models extend CNNs:

- **CNN + RNN**: use CNNs to process each frame, then feed feature sequences into LSTMs or GRUs to model temporal dynamics.
- **3D CNNs**: convolve in both space and time to process short clips.
- **Vision Transformers (ViT)**: treat images as token sequences and apply transformer layers; hybrids with CNN backbones have been explored for FER.

Examples:

- Minaee et al., “Deep‑Emotion: Facial Expression Recognition Using Attentional Convolutional Network,” *Sensors*, 2021. [MDPI](https://www.mdpi.com/1424-8220/21/9/3046)
- “A Comparative Study of Hybrid CNN and Vision Transformer Models for Facial Emotion Recognition,” 2024. [IEEE Xplore](https://ieeexplore.ieee.org/document/10818240/)

Although this project operates on **single frames at a low sampling rate** (every few seconds), the underlying theory is consistent with these broader trends—just applied in a lighter‑weight form suitable for in‑browser inference.

#### 3.3 Emotion representation: categorical vs dimensional

Two main emotion models are used:

- **Categorical** (Ekman’s basic emotions): anger, disgust, fear, happiness, sadness, surprise, often with “neutral”.
- **Dimensional**: continuous valence–arousal space, as in Russell’s circumplex model.

Datasets and tools often support both views:

- AffectNet (see below) provides **discrete labels and valence/arousal** annotations.
- Many works map categorical predictions into approximate valence–arousal coordinates to support music or media applications.

In this project, facial expressions are first recognized in a **categorical** way (e.g. `happy`, `sad`, `angry`, `fearful`, `neutral`) and then mapped into higher‑level moods (`happy`, `sad`, `gym`, `study`, `rock`) that are aligned with music playlists.

---

### 4. Standard Datasets and Benchmarks

#### 4.1 FER2013

FER2013 is a canonical benchmark for facial expression recognition:

- Introduced via the Kaggle “Challenges in Representation Learning” competition.
- 48×48 grayscale face crops, labeled with 7 expressions.
- Contains ~35k training images and ~7k test images.

Representative work:

- Goodfellow et al., “Challenges in Representation Learning: A Report on Three Machine Learning Contests,” *Neural Networks*, 2015. \(Introduces FER2013\).
- CNN baselines and improved architectures: e.g. arXiv:2105.03588.

**Why it matters here**: Many emotion models similar to what `face-api` uses are pre‑trained or evaluated on FER2013, providing strong prior knowledge for in‑browser emotion recognition.

#### 4.2 AffectNet

**AffectNet** is one of the largest “in the wild” datasets for facial affect:

- Mollahosseini et al., “AffectNet: A Database for Facial Expression, Valence, and Arousal Computing in the Wild,” *IEEE Trans. Affective Computing*, 2019. [arXiv](https://arxiv.org/abs/1708.03985)
- >1M images collected from the web, manually or semi‑automatically labeled with:
  - 8 discrete categories (including contempt).
  - Continuous valence and arousal scores.

**Relevance**: It motivates using **dimensional affect** for music, because valence and arousal map naturally to musical properties such as tempo, mode, and energy (e.g. high valence + high arousal → upbeat, energetic tracks).

#### 4.3 Other datasets and toolkits

- **CK+**, **JAFFE**, **MMI**, **SFEW**, **RAF‑DB**: classic FER datasets, often used for cross‑dataset evaluation \[Li & Deng 2020\].
- **Behaviour4All Toolkit**: in‑the‑wild facial behavior analysis, including expression, action units, and valence–arousal. [arXiv](https://arxiv.org/abs/2409.17717)
- **OpenVINO Multi‑face Analysis Pipeline**: example of a full face analysis system (detection → emotions → age/gender, etc.). [OpenVINO docs](https://docs.openvino.ai/2025/model-server/ovms_demo_multi_faces_analysis_pipeline.html)

These benchmark efforts show that robust FER requires both large, diverse datasets and architectures that can cope with occlusions, pose, head movement, and illumination changes—issues any real‑world system must handle.

---

### 5. Practical Emotion Recognition Pipelines

#### 5.1 Typical multi‑stage CV pipeline

Most systems follow a standard pipeline:

1. **Face detection**  
   - Use a detector (e.g. TinyFaceDetector, MTCNN, RetinaFace, or YOLO‑based variants) to localize faces.
   - Output bounding boxes and confidence scores.

2. **Alignment and normalization**  
   - Optionally detect landmarks (eyes, nose, mouth) and apply a similarity transform so faces are upright and centered.
   - Resize to a fixed resolution suitable for the FER model (e.g. 112×112 or 224×224).

3. **Feature extraction / inference**  
   - Pass the normalized face through a trained CNN (or ViT) to obtain logits or probabilities for each emotion.

4. **Post‑processing**  
   - Pick the argmax emotion and confidence.
   - Optionally smooth over time (e.g. exponential moving average, majority voting over a time window).
   - Map emotion to **application‑level categories** (e.g. moods, actions, or user states).

Examples of such pipelines:

- OpenVINO Multi‑Face Analysis Pipeline \(detection → alignment → attributes/emotions\). [OpenVINO docs](https://docs.openvino.ai/2025/model-server/ovms_demo_multi_faces_analysis_pipeline.html)
- Behaviour4All \[arXiv:2409.17717\] and LibreFace \[arXiv:2308.10713\] provide open‑source implementations of multi‑task facial behavior analysis (expressions, action units, valence–arousal).

#### 5.2 Edge vs cloud inference

Emotion recognition can be deployed:

- **On the client (edge/in‑browser)**:
  - Pros: no raw video leaves the device, lower latency, better privacy.
  - Cons: limited to lighter models; browser APIs and permissions may constrain camera access.

- **On the server (cloud)**:
  - Pros: can host heavier, GPU‑accelerated models.
  - Cons: raw or partially processed video must be transmitted; higher latency and privacy concerns.

This project deliberately performs **emotion inference in the browser** to keep raw video on the client and only transmit a **high‑level mood label** (optionally with confidence) to the backend.

---

### 6. Technologies Used in This Project

This section explains the concrete stack and how each component maps onto the research concepts above.

#### 6.1 Frontend: Next.js 14 + React + Tailwind + Framer Motion

The frontend is built with:

- **Next.js 14 (React + TypeScript)**: single‑page style app with views for landing, mood selection, camera, media player, and mood timeline (`page.tsx`).
- **Tailwind CSS** and **Framer Motion**: create a responsive, animated “glassmorphism” UI that visually reflects the current mood.
- **Dynamic imports**: the `FaceCamera` component is loaded dynamically (`dynamic(() => import('@/components/FaceCamera'), { ssr: false })`) to ensure all camera and `window` APIs only run client‑side.

Core user‑facing features:

- Manual mood selection via UI pills (e.g. `happy`, `sad`, `gym`, `study`, `rock`).
- Automatic mood detection via **camera + emotion recognition**.
- Playback via **YouTube** and fallback **MP3 audio URLs**, with mood‑adaptive gradients and mini‑player.
- A **Mood Timeline** that visualizes emotional history over the last 24 hours.

#### 6.2 In‑browser facial emotion recognition: `@vladmandic/face-api`

The `FaceCamera` component performs real‑time emotion recognition entirely in the browser:

- Uses **`@vladmandic/face-api`**, a JavaScript port of `face-api.js` with WebGL acceleration, to load:
  - `tinyFaceDetector` for efficient face detection.
  - `faceExpressionNet` for expression classification.
- Model weights are loaded from a CDN (`https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1/model/`), providing pre‑trained FER capabilities similar to CNN models trained on FER2013‑like datasets.
- The webcam video stream is obtained via `navigator.mediaDevices.getUserMedia` (subject to browser permissions and secure‑context requirements).

At runtime, the component:

- Periodically runs `detectSingleFace(...).withFaceExpressions()` on the video element.
- Extracts a probability distribution over expressions (e.g. happy, sad, angry, fearful, disgusted, surprised, neutral).
- Chooses the **dominant expression** and computes discrete confidence (percentage).
- Renders:
  - A **mood‑colored bounding box** around the face.
  - Overlay labels showing emotion and confidence.
  - Per‑expression progress bars.

This implements the **detection + classification** stages of the FER pipeline described earlier, but with all computation done locally in the browser.

#### 6.3 Emotion → Mood mapping

The project defines a simple yet effective mapping:

- `happy` → `happy`
- `surprised` → `happy`
- `sad` → `sad`
- `angry`, `disgusted` → `rock` (interpreted as intense/energetic/angsty)
- `fearful` → `sad`
- `neutral` → `study` (calm/focused)

This logic lives in the `EMOTION_TO_MOOD` map in the `FaceCamera` component. It translates generic facial emotions into the project’s **domain‑specific moods**, which are aligned with distinct playlist profiles in the recommender.

#### 6.4 Backend: FastAPI + PostgreSQL + Redis + PyTorch

The backend is a **FastAPI** application with:

- **PostgreSQL**: relational database for users, songs, interactions, and mood history.
- **Redis**: caching layer for performance.
- **PyTorch**: used for the **hybrid recommendation model** (user encoder, song encoder, mood embeddings) and FAISS for approximate nearest neighbor search (as indicated by the `ml` directory).

Configuration is managed via a Pydantic `Settings` class (`config.py`), which defines:

- Database and Redis URLs.
- JWT secrets and token lifetimes.
- ML hyperparameters such as embedding dimension (`EMBEDDING_DIM`) and the list of supported moods (`MOODS` = `["happy", "sad", "gym", "study", "rock"]`).

#### 6.5 Mood routing and history (`/api/moods`)

The `moods` router (`backend/app/routers/moods.py`) exposes:

- `GET /api/moods`: returns available moods with metadata (emoji, color, gradients).
- `POST /api/moods/select`: accepts a `MoodSelectRequest` containing:
  - `mood`: one of the allowed mood labels.
  - `source`: `"manual"` or `"camera"`.
  - `confidence`: the confidence score provided by the frontend.
  - The endpoint:
    - Validates the mood.
    - Records it via `record_mood(...)` in `recommendation_service`.
- `GET /api/moods/history`: returns a list of past mood selections for the current user, used to populate the **Mood Timeline** in the frontend.

The `MoodHistory` model and `record_mood` function treat emotion‑derived moods and manual moods uniformly. This lets the system:

- Blend manual and automatic affect signals.
- Analyze trends over time regardless of input method.

#### 6.6 Hybrid recommendation engine

The recommendation logic is implemented in `recommendation_service.py`, leveraging both **content features** and **user behavior**:

- Each song has audio‑level descriptors such as:
  - `valence` (happiness/positivity)
  - `energy`
  - `danceability`
  - `popularity`
  - `release_date`
  - Optional `mood_tag` and `genre`

- **Mood profiles** (`MOOD_PROFILES`) define target characteristics per mood, e.g.:
  - `happy`: high valence and medium–high energy.
  - `sad`: low valence and energy.
  - `gym`: high energy, high danceability.
  - `study`: low energy, low danceability.
  - `rock`: high energy, medium valence.

- A **mood match score** measures how close a song’s features are to the mood profile.
- A **popularity score** normalizes global popularity.
- A **freshness score** gives more weight to recent tracks, decaying with age.
- A **user similarity score** estimates collaborative preference, boosting songs whose genres match those of previously liked/played songs.

The final **hybrid score** is:

- \(score = \alpha \cdot \text{mood\_match} + \beta \cdot \text{user\_similarity} + \gamma \cdot \text{popularity} + \delta \cdot \text{freshness}\)

with additional boosts for songs whose `mood_tag` matches the selected mood.

This design is conceptually aligned with research on **hybrid recommenders** in music:

- Hidasi et al., “Session‑based Recommendations with Recurrent Neural Networks,” *ICLR*, 2016.
- Van den Oord et al., “Deep Content‑based Music Recommendation,” *NIPS*, 2013.

Although your implementation is more lightweight, it follows the same principle: **combine user interaction signals with content features and a mood prior**.

---

### 7. End‑to‑End Integration: From Camera to Music

Putting everything together, the project implements a full **perception‑to‑action loop**:

1. **User enables camera** on the frontend.
   - `FaceCamera` requests webcam access via `getUserMedia`.
   - Model weights for face detection and expression recognition are loaded from a CDN.

2. **Emotion recognition in the browser**.
   - Every few seconds (configurable scan interval), the system:
     - Detects a face using `TinyFaceDetector`.
     - Runs `faceExpressionNet` to get expression probabilities.
   - The dominant expression (e.g. `happy`, `sad`, `angry`) is selected with its confidence.
   - The UI overlays bounding boxes, labels, and expression histograms; optionally, text‑to‑speech describes the inferred mood.

3. **Emotion → Mood mapping**.
   - The dominant expression is mapped via `EMOTION_TO_MOOD` to an app‑level mood (e.g. `angry` → `rock`, `neutral` → `study`).
   - After a configurable number of **consecutive matches**, the mood is considered stable and auto‑applied.

4. **Mood selection and logging**.
   - The frontend calls the backend’s `POST /api/moods/select` endpoint with:
     - `mood` (e.g. `rock`)
     - `source` = `"camera"`
     - `confidence` from the expression classifier
   - The backend:
     - Validates the mood.
     - Records an entry in `MoodHistory`.

5. **Recommendation query**.
   - The frontend requests recommendations for the selected mood, e.g. `GET /api/recommendations?mood=rock&limit=20` (or equivalent service call).
   - The backend:
     - Fetches candidate songs from the database.
     - Computes mood match, popularity, freshness, and user similarity scores.
     - Produces a ranked playlist tailored to the user and mood.

6. **Playback and feedback loop**.
   - The frontend plays songs via:
     - YouTube video IDs (when available), or
     - direct MP3 URLs as a fallback.
   - User interactions (plays, skips, likes) are logged as `Interaction` events.
   - Future recommendations incorporate these interactions into the user similarity term and, in a full PyTorch pipeline, into an updated user embedding.

This end‑to‑end pipeline closely resembles academic prototypes of **emotion‑aware multimedia systems**, where a perceptual module (FER) drives a personalized content selector (recommender), but it is implemented with web‑native technologies suitable for real users.

---

### 8. Design Considerations and Limitations

#### 8.1 Privacy and data handling

- Emotion recognition is inherently sensitive. This project mitigates risk by:
  - Running all FER processing **entirely on the client**—raw video never leaves the browser.
  - Sending only **derived mood labels** and optional confidence scores to the backend.
- Researchers such as McStay (“Emotional AI: The Rise of Empathic Media,” 2018) highlight ethical concerns around affective computing; following a “minimum data” principle (as done here) is recommended.

#### 8.2 Robustness and bias

FER models are known to exhibit:

- Performance drops under occlusion, extreme head pose, or poor lighting.
- Demographic bias across age, gender, and skin tone, especially when trained on unbalanced datasets \[Li & Deng 2020; Shan et al. 2023\].

Mitigations relevant to this system include:

- Providing **manual mood selection** as a first‑class alternative.
- Treating emotion prediction as **advisory** rather than absolute—users can override or ignore it.
- Logging only high‑level moods, not raw emotions or facial features.

#### 8.3 Future improvements

Possible research‑inspired extensions:

- Replace `face-api` with a **more recent FER model** (e.g. transformer‑based architectures or Behaviour4All/LibreFace models compiled to WebAssembly or ONNX for browser use).
- Incorporate **valence–arousal regression** instead of purely categorical emotions, allowing smoother mapping into music features (tempo, mode, loudness).
- Use **sequence models** (e.g. RNN or transformer encoders) over recent moods and interactions to better capture context and transitions.
- Add **online learning** or periodic fine‑tuning of user embeddings to adapt recommendations over time.

---

### 9. Suggested Figures and Image Links

Below is a list of figure ideas with suggested external image resources you can embed later. Replace these URLs with downloaded or self‑hosted versions as needed.

- **Figure 1 – End‑to‑End System Architecture**  
  - Content: Block diagram showing webcam → face detection → emotion classifier → mood mapping → FastAPI backend → recommender → music player.  
  - You will likely draw this yourself (e.g. in Figma or draw.io) and export as `architecture.png`.

- **Figure 2 – Facial Expression Categories**  
  - Content: Examples of basic emotions (happy, sad, angry, fearful, disgusted, surprise, neutral).  
  - Example sources (for reference only, check licenses):  
    - `https://upload.wikimedia.org/wikipedia/commons/7/70/Basic_emotions.png`  
    - `https://upload.wikimedia.org/wikipedia/commons/5/5f/Face_Expressions.jpg`

- **Figure 3 – FER Pipeline**  
  - Content: Generic CV pipeline: input frame → face detection → alignment → FER CNN → softmax over emotions.  
  - You can base this on diagrams from:  
    - OpenVINO multi‑face pipeline docs: `https://docs.openvino.ai/2025/model-server/_images/ovms_multi_faces_pipeline.svg`

- **Figure 4 – Valence–Arousal Space**  
  - Content: 2D circumplex diagram showing valence (x‑axis) vs arousal (y‑axis) and typical emotions.  
  - Example reference image:  
    - `https://upload.wikimedia.org/wikipedia/commons/6/6a/Valence-arousal_circumplex.svg`

- **Figure 5 – Sample FER2013 Faces**  
  - Content: Grid of example faces from FER2013 with labels.  
  - Reference (for your own recreation):  
    - Kaggle FER2013 page screenshots: `https://storage.googleapis.com/kaggle-competitions/kaggle/3136/media/fer2013.png`

- **Figure 6 – Mood Profiles in Feature Space**  
  - Content: Plot showing audio features (valence, energy, danceability) vs mood (happy, sad, gym, study, rock).  
  - You can generate a radar chart or bar plot using your own synthetic values or those from your ML pipeline.

- **Figure 7 – UI Screenshots**  
  - Content: Screenshots from your own app:  
    - Landing page with mood features.  
    - Camera view with bounding box and expression breakdown.  
    - Mood timeline visualization.  
  - Capture using your browser and store them in your repo (e.g. `docs/images/ui-camera.png`).

---

### 10. Conclusion

This project operationalizes decades of research in **facial expression recognition** and **hybrid recommendation systems** in a web‑native, privacy‑aware music application. By:

- Running a **client‑side FER model** to infer emotions directly from the user’s face.
- Mapping those emotions to a compact set of **musical moods** aligned with curated audio feature profiles.
- Combining mood signals with **user interaction history and content features** in a hybrid recommender.

it delivers an end‑to‑end system that adapts playlists to how the user feels in real time. The design choices (client‑side inference, simple yet transparent mood mapping, hybrid scoring) are grounded in existing literature while remaining practical for deployment, and they provide a solid foundation for future research directions such as valence–arousal modeling, more advanced FER architectures, and deeper personalization of the music experience.

