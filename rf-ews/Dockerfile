FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY rf_ews ./rf_ews

ENTRYPOINT ["python", "-m", "rf_ews.cli"]
CMD ["--help"]
