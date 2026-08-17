# Official Playwright image — Python 3.11 + Chromium + all OS deps pre-installed.
# This replaces the nixpacks.toml approach which kept failing to find pip.
FROM mcr.microsoft.com/playwright/python:v1.44.0-jammy

WORKDIR /app

# Install Python deps (pip is included in this image)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Re-link Playwright browsers to match the installed version
RUN playwright install chromium

# Copy scraper source
COPY . .

CMD ["python", "run_all.py"]
