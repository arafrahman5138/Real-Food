# OAuth Setup Guide

This guide explains how to set up Google and Apple OAuth for social authentication.

## Google OAuth Setup

### 1. Create Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google+ API

### 2. Create OAuth Credentials
1. Navigate to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth 2.0 Client ID**
3. Configure the OAuth consent screen if prompted
4. Create two OAuth 2.0 Client IDs:
   - **iOS Client**: Select "iOS" as application type
     - Bundle ID: `com.wholefoodlabs.app`
   - **Web Client**: Select "Web application" as application type (used for Expo Go)
     - Authorized redirect URIs: 
       - `https://auth.expo.io/@YOUR_EXPO_USERNAME/wholefoodlabs`
       - Custom: based on your expo redirect URI

### 3. Update Configuration
Edit `frontend/constants/Config.ts`:

```typescript
export const GOOGLE_CLIENT_ID = __DEV__
  ? 'YOUR_DEV_WEB_CLIENT_ID.apps.googleusercontent.com'
  : 'YOUR_PROD_WEB_CLIENT_ID.apps.googleusercontent.com';

export const GOOGLE_IOS_CLIENT_ID = __DEV__
  ? 'YOUR_DEV_IOS_CLIENT_ID.apps.googleusercontent.com'
  : 'YOUR_PROD_IOS_CLIENT_ID.apps.googleusercontent.com';
```

Replace:
- `YOUR_DEV_WEB_CLIENT_ID` with your web client ID
- `YOUR_DEV_IOS_CLIENT_ID` with your iOS client ID
- `YOUR_PROD_*` with production credentials when ready

### 4. Test Redirect URI
Run this command to see your redirect URI:

```bash
cd frontend
npx expo start
# Look for output like: "Using redirect URI: exp://..."
```

Or check in code by logging `redirectUri` in login.tsx.

---

## Apple Sign-In Setup

### 1. Configure App ID in Apple Developer Portal
1. Go to [Apple Developer](https://developer.apple.com/account/)
2. Navigate to **Certificates, Identifiers & Profiles** → **Identifiers**
3. Select your App ID (`com.wholefoodlabs.app`) or create one
4. Enable **Sign In with Apple** capability
5. Save changes

### 2. Xcode Configuration
1. Open `frontend/ios/WholeFoodLabs.xcworkspace` in Xcode
2. Select the project in the navigator
3. Go to **Signing & Capabilities** tab
4. Click **+ Capability**
5. Add **Sign In with Apple**
6. Ensure your Team is set correctly

### 3. Test on Physical Device
> ⚠️ **Important**: Apple Sign-In only works on physical iOS devices, not simulators.

To test:
1. Build the app to a physical iPhone
2. Use a real Apple ID (sandbox or production)
3. Sign in with Apple

---

## Backend Token Verification (Optional but Recommended)

For production, you should verify OAuth tokens on the backend.

### Google Token Verification

Install the Google Auth library:
```bash
cd backend
source venv/bin/activate
pip install google-auth
```

Update `backend/app/routers/auth.py`:

```python
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

@router.post("/social")
async def social_auth(request: SocialAuthRequest, db: Session = Depends(get_db)):
    if request.provider == "google":
        # Verify the token with Google
        try:
            idinfo = id_token.verify_oauth2_token(
                request.token, 
                google_requests.Request(), 
                GOOGLE_CLIENT_ID
            )
            # Token is valid, use email from token
            email = idinfo['email']
            name = idinfo.get('name', request.name)
        except ValueError:
            raise HTTPException(status_code=401, detail="Invalid Google token")
    
    # ... rest of existing code
```

### Apple Token Verification

Apple provides JWT tokens that can be verified using PyJWT:

```bash
pip install pyjwt cryptography
```

Add to `backend/app/routers/auth.py`:

```python
import jwt
import requests

@router.post("/social")
async def social_auth(request: SocialAuthRequest, db: Session = Depends(get_db)):
    if request.provider == "apple":
        # Fetch Apple's public keys
        apple_keys = requests.get("https://appleid.apple.com/auth/keys").json()
        
        # Verify the token (simplified - add proper key selection)
        try:
            decoded = jwt.decode(
                request.token, 
                options={"verify_signature": False}  # Use proper verification in production
            )
            email = decoded.get('email', request.email)
        except jwt.InvalidTokenError:
            raise HTTPException(status_code=401, detail="Invalid Apple token")
    
    # ... rest of existing code
```

---

## Testing

### Local Development
1. Start the backend: `cd backend && ./start.sh`
2. Start the frontend: `cd frontend && npm start`
3. Test on iOS simulator (Google) or physical device (Google + Apple)

### Verify OAuth Flow
- **Google**: Should open browser, show Google account picker, redirect back with user info
- **Apple**: Should show native Apple Sign-In dialog, authenticate with Face ID/Touch ID

### Troubleshooting
- **"Invalid redirect URI"**: Ensure Google Console has the correct redirect URI from expo
- **"Invalid client ID"**: Check Config.ts has the correct client IDs
- **Apple not showing**: Must use physical device, not simulator
- **Network error**: Ensure backend is running and API_URL is correct in Config.ts
