# Umbra Online Zone Background Generator - Setup Guide

## Quick Start

### 1. Install Python dependencies
```bash
cd tools
pip install -r requirements.txt
```

### 2. Get your Google API Key
1. Go to https://aistudio.google.com/apikey
2. Create a new API key
3. Set it as an environment variable:

**Windows (PowerShell):**
```powershell
$env:GOOGLE_API_KEY = "your_api_key_here"
```

**Or create a `.env` file in the tools folder:**
```
GOOGLE_API_KEY=your_api_key_here
```

### 3. Run the generator

**Test with a single zone first:**
```bash
python generate_nanobanana_images.py --zone B3 --dry-run
```

**Generate a single zone:**
```bash
python generate_nanobanana_images.py --zone B3
```

**Generate all zones (this will take a while):**
```bash
python generate_nanobanana_images.py
```

## Command Options

| Option | Description |
|--------|-------------|
| `--dry-run` | Preview prompts without generating images |
| `--zone ZONE_ID` | Generate only a specific zone (e.g., `--zone B3`) |
| `--model flash` | Use Gemini 2.5 Flash Image (default, faster) |
| `--model pro` | Use Gemini 3 Pro Image (higher quality, thinking) |
| `--resolution 1K` | Image resolution: 1K (default), 2K, or 4K (pro only) |
| `--force` | Regenerate images even if they exist |
| `--delay 3000` | Delay between requests in milliseconds |
| `--export` | Export prompts to text file for manual use |

## Examples

```bash
# Preview all prompts
python generate_nanobanana_images.py --dry-run

# Generate one zone with Pro model at 2K
python generate_nanobanana_images.py --zone K5 --model pro --resolution 2K

# Regenerate all zones with longer delay
python generate_nanobanana_images.py --force --delay 5000

# Export prompts for manual generation in AI Studio
python generate_nanobanana_images.py --export
```

## Model Comparison

| Model | Speed | Quality | Max Resolution | Best For |
|-------|-------|---------|----------------|----------|
| **flash** (Nano Banana) | Fast | Good | 1K | Batch generation, quick iterations |
| **pro** (Nano Banana Pro) | Slower | Excellent | 4K | Final assets, complex scenes |

## Output

Generated images are saved to:
```
client/assets/zones/{ZONE_ID}.jpg
```

## Rate Limits

The Gemini API has rate limits. If you hit them:
- Increase `--delay` (e.g., `--delay 10000` for 10 seconds)
- Use the free tier limits: ~15 requests/minute for Flash

## Troubleshooting

**"GOOGLE_API_KEY not found"**
- Make sure you've set the environment variable or created a `.env` file

**"google-genai package not installed"**
- Run: `pip install google-genai pillow`

**Rate limit errors**
- Increase the delay: `--delay 10000`
- Wait a minute and try again

**Image quality issues**
- Try the `--model pro` option for better quality
- Adjust prompts in `zone_prompts_all.json`
