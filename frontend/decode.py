import sys, re, binascii

esc_re = re.compile(rb'\x1b\[[0-9;?]*[@-~]')   # CSI
raw = open(sys.argv[1], 'rb').read()
cmds = esc_re.findall(raw)
for c in cmds:
    print(binascii.hexlify(c).decode())