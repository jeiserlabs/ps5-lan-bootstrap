import ftplib

def check():
    ftp = ftplib.FTP()
    ftp.connect('192.168.2.2', 2121, timeout=5)
    ftp.login()
    
    candidates = ['/user/home', '/user/savedata', '/system_data/savedata', '/user/savedata_meta']
    for c in candidates:
        try:
            lines = []
            ftp.retrlines(f'LIST {c}', lines.append)
            clean = [l.split()[-1] for l in lines if l.split()[-1] not in ('.', '..')]
            print(f'{c}: {clean}')
        except Exception as e:
            print(f'{c}: err {e}')

    try:
        users = []
        ftp.retrlines('LIST /user/home', users.append)
        u_dirs = [l.split()[-1] for l in users if l.split()[-1] not in ('.', '..')]
        for u in u_dirs:
            print(f'Checking user {u}...')
            for sub in ['savedata', 'savedata_meta']:
                p = f'/user/home/{u}/{sub}'
                try:
                    s_lines = []
                    ftp.retrlines(f'LIST {p}', s_lines.append)
                    games = [l.split()[-1] for l in s_lines if l.split()[-1] not in ('.', '..')]
                    print(f'  {p} -> {games}')
                except Exception as e:
                    print(f'  {p} -> err: {e}')
    except Exception as e:
        print('user home err:', e)

    ftp.quit()

if __name__ == '__main__':
    check()
