FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04

WORKDIR /worker

ARG BLENDER_VERSION=4.3.2
ARG BLENDER_MAJOR=4.3

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    libegl1 \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    libsm6 \
    libx11-6 \
    libxcursor1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxinerama1 \
    libxkbcommon0 \
    libxrandr2 \
    libxrender1 \
    libxxf86vm1 \
    python3 \
    python3-pip \
    xz-utils \
  && rm -rf /var/lib/apt/lists/*

RUN curl -L "https://download.blender.org/release/Blender${BLENDER_MAJOR}/blender-${BLENDER_VERSION}-linux-x64.tar.xz" -o /tmp/blender.tar.xz \
  && mkdir -p /opt/blender \
  && tar -xf /tmp/blender.tar.xz -C /opt/blender --strip-components=1 \
  && ln -s /opt/blender/blender /usr/local/bin/blender \
  && rm /tmp/blender.tar.xz

RUN python3 -m pip install --no-cache-dir -U pip

COPY workers/runpod-blender/requirements.txt /worker/requirements.txt
RUN python3 -m pip install --no-cache-dir -r /worker/requirements.txt

COPY workers/runpod-blender /worker

CMD ["python3", "-u", "handler.py"]
